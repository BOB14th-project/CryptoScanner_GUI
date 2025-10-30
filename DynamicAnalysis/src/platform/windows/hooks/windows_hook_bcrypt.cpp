// windows_hook_bcrypt.cpp - Hook Windows CNG (BCrypt) crypto APIs
#include "common/pch.h"
#include "common/output.h"
#include "common/reentry_guard.h"

#include <windows.h>
#include <bcrypt.h>
#include <detours.h>

#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#pragma comment(lib, "bcrypt.lib")

namespace {

constexpr const char* SURFACE = "bcrypt";
constexpr size_t kMaxSnapshot = 512;

inline bool verbose_mode() {
    const char* env = std::getenv("HOOK_VERBOSE");
    return env && *env == '1';
}

struct KeyState {
    std::vector<uint8_t> key;
    std::string algorithm;
};

std::mutex g_key_mu;
std::unordered_map<BCRYPT_KEY_HANDLE, KeyState> g_key_states;

typedef NTSTATUS (WINAPI* fn_BCryptGetProperty)(BCRYPT_HANDLE, LPCWSTR, PUCHAR, ULONG, ULONG*, ULONG);
typedef NTSTATUS (WINAPI* fn_BCryptGenerateSymmetricKey)(BCRYPT_ALG_HANDLE, BCRYPT_KEY_HANDLE*, PUCHAR, ULONG, PUCHAR, ULONG, ULONG);
typedef NTSTATUS (WINAPI* fn_BCryptImportKey)(BCRYPT_ALG_HANDLE, BCRYPT_KEY_HANDLE, LPCWSTR, BCRYPT_KEY_HANDLE*, PUCHAR, ULONG, PUCHAR, ULONG, ULONG);
typedef NTSTATUS (WINAPI* fn_BCryptEncrypt)(BCRYPT_KEY_HANDLE, PUCHAR, ULONG, VOID*, PUCHAR, ULONG, PUCHAR, ULONG, ULONG*, ULONG);
typedef NTSTATUS (WINAPI* fn_BCryptDecrypt)(BCRYPT_KEY_HANDLE, PUCHAR, ULONG, VOID*, PUCHAR, ULONG, PUCHAR, ULONG, ULONG*, ULONG);
typedef NTSTATUS (WINAPI* fn_BCryptDestroyKey)(BCRYPT_KEY_HANDLE);

static fn_BCryptGetProperty Real_BCryptGetProperty = nullptr;
static fn_BCryptGenerateSymmetricKey Real_BCryptGenerateSymmetricKey = nullptr;
static fn_BCryptImportKey Real_BCryptImportKey = nullptr;
static fn_BCryptEncrypt Real_BCryptEncrypt = nullptr;
static fn_BCryptDecrypt Real_BCryptDecrypt = nullptr;
static fn_BCryptDestroyKey Real_BCryptDestroyKey = nullptr;

std::string algorithm_name_from_handle(BCRYPT_ALG_HANDLE handle) {
    if (!Real_BCryptGetProperty) return SURFACE;

    ULONG required = 0;
    if (Real_BCryptGetProperty(handle, BCRYPT_ALGORITHM_NAME, nullptr, 0, &required, 0) != 0 || required == 0) {
        return SURFACE;
    }
    std::vector<wchar_t> buffer(required / sizeof(wchar_t) + 1, 0);
    if (Real_BCryptGetProperty(handle, BCRYPT_ALGORITHM_NAME, reinterpret_cast<PUCHAR>(buffer.data()),
                               static_cast<ULONG>(buffer.size() * sizeof(wchar_t)), &required, 0) != 0) {
        return SURFACE;
    }
    std::wstring wide(buffer.data());
    std::string utf8;
    if (!wide.empty()) {
        int len = WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), -1, nullptr, 0, nullptr, nullptr);
        if (len > 0) {
            utf8.resize(static_cast<size_t>(len - 1));
            WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), -1, utf8.data(), len - 1, nullptr, nullptr);
        }
    }
    if (utf8.empty()) utf8 = SURFACE;
    return utf8;
}

void remember_key(BCRYPT_KEY_HANDLE key, const std::vector<uint8_t>& key_bytes, const std::string& algorithm) {
    if (!key || key_bytes.empty()) return;
    KeyState state;
    state.key = key_bytes;
    state.algorithm = algorithm.empty() ? SURFACE : algorithm;

    std::lock_guard<std::mutex> lock(g_key_mu);
    g_key_states[key] = std::move(state);
}

void forget_key(BCRYPT_KEY_HANDLE key) {
    if (!key) return;
    std::lock_guard<std::mutex> lock(g_key_mu);
    g_key_states.erase(key);
}

bool lookup_key(BCRYPT_KEY_HANDLE key, KeyState& state) {
    std::lock_guard<std::mutex> lock(g_key_mu);
    auto it = g_key_states.find(key);
    if (it == g_key_states.end()) return false;
    state = it->second;
    return true;
}

void log_bcrypt_event(const char* api,
                      const char* direction,
                      const KeyState& state,
                      const uint8_t* iv,
                      size_t iv_len,
                      const uint8_t* tag,
                      size_t tag_len) {
    ndjson_log_key_event(
        SURFACE,
        api,
        direction,
        state.algorithm.c_str(),
        state.key.empty() ? nullptr : state.key.data(),
        static_cast<int>(state.key.size()),
        iv && iv_len ? iv : nullptr,
        static_cast<int>(iv_len),
        tag && tag_len ? tag : nullptr,
        static_cast<int>(tag_len));
}

NTSTATUS WINAPI Hook_BCryptGenerateSymmetricKey(BCRYPT_ALG_HANDLE hAlgorithm,
                                                BCRYPT_KEY_HANDLE* phKey,
                                                PUCHAR pbKeyObject,
                                                ULONG cbKeyObject,
                                                PUCHAR pbSecret,
                                                ULONG cbSecret,
                                                ULONG dwFlags) {
    ReentryGuard guard;
    if (!Real_BCryptGenerateSymmetricKey) {
        return STATUS_INVALID_HANDLE;
    }

    NTSTATUS status = Real_BCryptGenerateSymmetricKey(hAlgorithm, phKey, pbKeyObject, cbKeyObject,
                                                      pbSecret, cbSecret, dwFlags);
    if (!guard || status != 0 || !phKey || !*phKey || !pbSecret || cbSecret == 0) {
        return status;
    }

    std::vector<uint8_t> key_bytes(pbSecret, pbSecret + cbSecret);
    std::string algorithm = algorithm_name_from_handle(hAlgorithm);
    remember_key(*phKey, key_bytes, algorithm);
    if (verbose_mode()) {
        fprintf(stderr, "[hook_windows][bcrypt] captured key (%zu bytes) for %s\n", key_bytes.size(), algorithm.c_str());
    }
    return status;
}

NTSTATUS WINAPI Hook_BCryptImportKey(BCRYPT_ALG_HANDLE hAlgorithm,
                                     BCRYPT_KEY_HANDLE hImportKey,
                                     LPCWSTR pszBlobType,
                                     BCRYPT_KEY_HANDLE* phKey,
                                     PUCHAR pbKeyObject,
                                     ULONG cbKeyObject,
                                     PUCHAR pbInput,
                                     ULONG cbInput,
                                     ULONG dwFlags) {
    ReentryGuard guard;
    if (!Real_BCryptImportKey) {
        return STATUS_INVALID_HANDLE;
    }

    NTSTATUS status = Real_BCryptImportKey(hAlgorithm, hImportKey, pszBlobType, phKey,
                                           pbKeyObject, cbKeyObject, pbInput, cbInput, dwFlags);
    if (!guard || status != 0 || !phKey || !*phKey || !pbInput || cbInput == 0) {
        return status;
    }

    std::vector<uint8_t> key_bytes;
    if (pszBlobType && wcscmp(pszBlobType, BCRYPT_KEY_DATA_BLOB) == 0 && cbInput > sizeof(BCRYPT_KEY_DATA_BLOB_HEADER)) {
        auto* header = reinterpret_cast<BCRYPT_KEY_DATA_BLOB_HEADER*>(pbInput);
        if (header->dwMagic == BCRYPT_KEY_DATA_BLOB_MAGIC && header->dwVersion == BCRYPT_KEY_DATA_BLOB_VERSION1) {
            ULONG key_len = header->cbKeyData;
            if (key_len > 0 && sizeof(BCRYPT_KEY_DATA_BLOB_HEADER) + key_len <= cbInput) {
                key_bytes.assign(pbInput + sizeof(BCRYPT_KEY_DATA_BLOB_HEADER),
                                 pbInput + sizeof(BCRYPT_KEY_DATA_BLOB_HEADER) + key_len);
            }
        }
    } else {
        key_bytes.assign(pbInput, pbInput + cbInput);
    }

    if (!key_bytes.empty()) {
        std::string algorithm = algorithm_name_from_handle(hAlgorithm);
        remember_key(*phKey, key_bytes, algorithm);
        if (verbose_mode()) {
            fprintf(stderr, "[hook_windows][bcrypt] imported key (%zu bytes) for %s\n", key_bytes.size(), algorithm.c_str());
        }
    }

    return status;
}

NTSTATUS WINAPI Hook_BCryptEncrypt(BCRYPT_KEY_HANDLE hKey,
                                   PUCHAR pbInput,
                                   ULONG cbInput,
                                   VOID* pPaddingInfo,
                                   PUCHAR pbIV,
                                   ULONG cbIV,
                                   PUCHAR pbOutput,
                                   ULONG cbOutput,
                                   ULONG* pcbResult,
                                   ULONG dwFlags) {
    if (!Real_BCryptEncrypt) {
        return STATUS_INVALID_HANDLE;
    }

    ReentryGuard guard;
    NTSTATUS status = Real_BCryptEncrypt(hKey, pbInput, cbInput, pPaddingInfo,
                                         pbIV, cbIV, pbOutput, cbOutput, pcbResult, dwFlags);

    if (!guard || status != 0) {
        return status;
    }

    KeyState state;
    if (!lookup_key(hKey, state)) {
        return status;
    }

    const uint8_t* iv = pbIV;
    size_t iv_len = static_cast<size_t>(cbIV);
    const uint8_t* tag = nullptr;
    size_t tag_len = 0;

    if (pPaddingInfo) {
        auto* auth = reinterpret_cast<BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO*>(pPaddingInfo);
        if (auth->pbTag && auth->cbTag > 0) {
            tag = auth->pbTag;
            tag_len = std::min(static_cast<size_t>(auth->cbTag), kMaxSnapshot);
        }
        if (auth->pbNonce && auth->cbNonce > 0) {
            iv = auth->pbNonce;
            iv_len = std::min(static_cast<size_t>(auth->cbNonce), kMaxSnapshot);
        }
    }

    log_bcrypt_event("BCryptEncrypt", "enc", state, iv, iv_len, tag, tag_len);
    return status;
}

NTSTATUS WINAPI Hook_BCryptDecrypt(BCRYPT_KEY_HANDLE hKey,
                                   PUCHAR pbInput,
                                   ULONG cbInput,
                                   VOID* pPaddingInfo,
                                   PUCHAR pbIV,
                                   ULONG cbIV,
                                   PUCHAR pbOutput,
                                   ULONG cbOutput,
                                   ULONG* pcbResult,
                                   ULONG dwFlags) {
    if (!Real_BCryptDecrypt) {
        return STATUS_INVALID_HANDLE;
    }

    ReentryGuard guard;
    NTSTATUS status = Real_BCryptDecrypt(hKey, pbInput, cbInput, pPaddingInfo,
                                         pbIV, cbIV, pbOutput, cbOutput, pcbResult, dwFlags);

    if (!guard || status != 0) {
        return status;
    }

    KeyState state;
    if (!lookup_key(hKey, state)) {
        return status;
    }

    const uint8_t* iv = pbIV;
    size_t iv_len = static_cast<size_t>(cbIV);
    const uint8_t* tag = nullptr;
    size_t tag_len = 0;

    if (pPaddingInfo) {
        auto* auth = reinterpret_cast<BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO*>(pPaddingInfo);
        if (auth->pbTag && auth->cbTag > 0) {
            tag = auth->pbTag;
            tag_len = std::min(static_cast<size_t>(auth->cbTag), kMaxSnapshot);
        }
        if (auth->pbNonce && auth->cbNonce > 0) {
            iv = auth->pbNonce;
            iv_len = std::min(static_cast<size_t>(auth->cbNonce), kMaxSnapshot);
        }
    }

    log_bcrypt_event("BCryptDecrypt", "dec", state, iv, iv_len, tag, tag_len);
    return status;
}

NTSTATUS WINAPI Hook_BCryptDestroyKey(BCRYPT_KEY_HANDLE hKey) {
    if (!Real_BCryptDestroyKey) {
        return STATUS_INVALID_HANDLE;
    }

    forget_key(hKey);
    return Real_BCryptDestroyKey(hKey);
}

bool resolve_bcrypt_symbols() {
    HMODULE hBcrypt = GetModuleHandleW(L"bcrypt.dll");
    if (!hBcrypt) {
        hBcrypt = LoadLibraryW(L"bcrypt.dll");
    }
    if (!hBcrypt) {
        if (verbose_mode()) {
            fprintf(stderr, "[hook_windows][bcrypt] bcrypt.dll not found\n");
        }
        return false;
    }

    Real_BCryptGetProperty = reinterpret_cast<fn_BCryptGetProperty>(GetProcAddress(hBcrypt, "BCryptGetProperty"));
    Real_BCryptGenerateSymmetricKey = reinterpret_cast<fn_BCryptGenerateSymmetricKey>(GetProcAddress(hBcrypt, "BCryptGenerateSymmetricKey"));
    Real_BCryptImportKey = reinterpret_cast<fn_BCryptImportKey>(GetProcAddress(hBcrypt, "BCryptImportKey"));
    Real_BCryptEncrypt = reinterpret_cast<fn_BCryptEncrypt>(GetProcAddress(hBcrypt, "BCryptEncrypt"));
    Real_BCryptDecrypt = reinterpret_cast<fn_BCryptDecrypt>(GetProcAddress(hBcrypt, "BCryptDecrypt"));
    Real_BCryptDestroyKey = reinterpret_cast<fn_BCryptDestroyKey>(GetProcAddress(hBcrypt, "BCryptDestroyKey"));

    return Real_BCryptGenerateSymmetricKey && Real_BCryptImportKey &&
           Real_BCryptEncrypt && Real_BCryptDecrypt && Real_BCryptDestroyKey;
}

bool g_encrypt_hooked = false;
bool g_decrypt_hooked = false;
bool g_gen_hooked = false;
bool g_import_hooked = false;
bool g_destroy_hooked = false;

} // namespace

extern "C" {

BOOL InstallBcryptHooks() {
    if (!resolve_bcrypt_symbols()) {
        return FALSE;
    }

    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    LONG status = DetourAttach(reinterpret_cast<PVOID*>(&Real_BCryptGenerateSymmetricKey), Hook_BCryptGenerateSymmetricKey);
    if (status == NO_ERROR) g_gen_hooked = true;
    status = DetourAttach(reinterpret_cast<PVOID*>(&Real_BCryptImportKey), Hook_BCryptImportKey);
    if (status == NO_ERROR) g_import_hooked = true;
    status = DetourAttach(reinterpret_cast<PVOID*>(&Real_BCryptEncrypt), Hook_BCryptEncrypt);
    if (status == NO_ERROR) g_encrypt_hooked = true;
    status = DetourAttach(reinterpret_cast<PVOID*>(&Real_BCryptDecrypt), Hook_BCryptDecrypt);
    if (status == NO_ERROR) g_decrypt_hooked = true;
    status = DetourAttach(reinterpret_cast<PVOID*>(&Real_BCryptDestroyKey), Hook_BCryptDestroyKey);
    if (status == NO_ERROR) g_destroy_hooked = true;

    if (!g_gen_hooked && !g_import_hooked && !g_encrypt_hooked && !g_decrypt_hooked) {
        DetourTransactionAbort();
        if (verbose_mode()) {
            fprintf(stderr, "[hook_windows][bcrypt] failed to attach any BCrypt hooks\n");
        }
        return FALSE;
    }

    if (DetourTransactionCommit() != NO_ERROR) {
        if (verbose_mode()) {
            fprintf(stderr, "[hook_windows][bcrypt] detour commit failed\n");
        }
        return FALSE;
    }

    if (verbose_mode()) {
        fprintf(stderr, "[hook_windows][bcrypt] hooks installed\n");
    }
    return TRUE;
}

BOOL UninstallBcryptHooks() {
    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    if (g_gen_hooked && Real_BCryptGenerateSymmetricKey) {
        DetourDetach(reinterpret_cast<PVOID*>(&Real_BCryptGenerateSymmetricKey), Hook_BCryptGenerateSymmetricKey);
        g_gen_hooked = false;
    }
    if (g_import_hooked && Real_BCryptImportKey) {
        DetourDetach(reinterpret_cast<PVOID*>(&Real_BCryptImportKey), Hook_BCryptImportKey);
        g_import_hooked = false;
    }
    if (g_encrypt_hooked && Real_BCryptEncrypt) {
        DetourDetach(reinterpret_cast<PVOID*>(&Real_BCryptEncrypt), Hook_BCryptEncrypt);
        g_encrypt_hooked = false;
    }
    if (g_decrypt_hooked && Real_BCryptDecrypt) {
        DetourDetach(reinterpret_cast<PVOID*>(&Real_BCryptDecrypt), Hook_BCryptDecrypt);
        g_decrypt_hooked = false;
    }
    if (g_destroy_hooked && Real_BCryptDestroyKey) {
        DetourDetach(reinterpret_cast<PVOID*>(&Real_BCryptDestroyKey), Hook_BCryptDestroyKey);
        g_destroy_hooked = false;
    }

    DetourTransactionCommit();

    {
        std::lock_guard<std::mutex> lock(g_key_mu);
        g_key_states.clear();
    }

    if (verbose_mode()) {
        fprintf(stderr, "[hook_windows][bcrypt] hooks uninstalled\n");
    }
    return TRUE;
}

} // extern "C"
