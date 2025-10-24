// hook_openssl_detours.cpp - Windows OpenSSL hooking using Microsoft Detours
#include "common/pch.h"
#include "common/output.h"
#include "common/reentry_guard.h"
#include "common/hook_openssl_state.h"

#include <windows.h>
#include <detours.h>
#include <openssl/evp.h>

typedef struct engine_st ENGINE;

static constexpr const char* SURFACE = "openssl";

// ---- Forward declarations of dynamic function pointers ----
// These will be resolved at runtime via GetProcAddress
static const char* (*Dyn_EVP_CIPHER_get0_name)(const EVP_CIPHER*) = nullptr;
static const EVP_CIPHER* (*Dyn_EVP_CIPHER_CTX_get0_cipher)(const EVP_CIPHER_CTX*) = nullptr;
static const EVP_CIPHER* (*Dyn_EVP_CIPHER_CTX_cipher)(const EVP_CIPHER_CTX*) = nullptr;
static int (*Dyn_EVP_CIPHER_key_length)(const EVP_CIPHER*) = nullptr;
static int (*Dyn_EVP_CIPHER_iv_length)(const EVP_CIPHER*) = nullptr;
static int (*Dyn_EVP_CIPHER_nid)(const EVP_CIPHER*) = nullptr;
static const char* (*Dyn_OBJ_nid2sn)(int) = nullptr;

// ---- OpenSSL cipher utilities (using dynamic function pointers) ----
static inline const char* cipher_name(const EVP_CIPHER* c) {
    if (!c) return nullptr;

    // Try OpenSSL 1.1+ API first
    if (Dyn_EVP_CIPHER_get0_name) {
        return Dyn_EVP_CIPHER_get0_name(c);
    }

    // Fallback to old API
    if (Dyn_EVP_CIPHER_nid && Dyn_OBJ_nid2sn) {
        return Dyn_OBJ_nid2sn(Dyn_EVP_CIPHER_nid(c));
    }

    return nullptr;
}

static inline const EVP_CIPHER* cipher_from_ctx(const EVP_CIPHER_CTX* ctx) {
    if (!ctx) return nullptr;

    // Try OpenSSL 1.1+ API first
    if (Dyn_EVP_CIPHER_CTX_get0_cipher) {
        return Dyn_EVP_CIPHER_CTX_get0_cipher(ctx);
    }

    // Fallback to old API
    if (Dyn_EVP_CIPHER_CTX_cipher) {
        return Dyn_EVP_CIPHER_CTX_cipher(ctx);
    }

    return nullptr;
}

// ---- Original function pointers (to be detoured) ----
// Initialize to nullptr - will be resolved at runtime via GetProcAddress to avoid linking to OpenSSL
static int (*TrueEVP_EncryptInit_ex)(EVP_CIPHER_CTX*, const EVP_CIPHER*, ENGINE*, const unsigned char*, const unsigned char*) = nullptr;
static int (*TrueEVP_DecryptInit_ex)(EVP_CIPHER_CTX*, const EVP_CIPHER*, ENGINE*, const unsigned char*, const unsigned char*) = nullptr;
static int (*TrueEVP_CipherInit_ex)(EVP_CIPHER_CTX*, const EVP_CIPHER*, ENGINE*, const unsigned char*, const unsigned char*, int) = nullptr;
static int (*TrueEVP_CIPHER_CTX_ctrl)(EVP_CIPHER_CTX*, int, int, void*) = nullptr;

// Helper to dynamically resolve OpenSSL functions
static bool ResolveOpenSSLFunctions()
{
    static bool resolved = false;
    if (resolved) return true;

    // Try to load libcrypto from the process
    HMODULE hCrypto = GetModuleHandleA("libcrypto-3-x64.dll");
    if (!hCrypto) {
        hCrypto = GetModuleHandleA("libcrypto.dll");
    }
    if (!hCrypto) {
        hCrypto = GetModuleHandleA("libeay32.dll"); // Old OpenSSL naming
    }

    if (!hCrypto) {
        // Try to load it - first try without path
        hCrypto = LoadLibraryA("libcrypto-3-x64.dll");
    }
    if (!hCrypto) {
        hCrypto = LoadLibraryA("libcrypto.dll");
    }
    if (!hCrypto) {
        hCrypto = LoadLibraryA("libeay32.dll");
    }

    if (!hCrypto) {
        if (std::getenv("HOOK_VERBOSE")) {
            fprintf(stderr, "[hook_windows] Could not load OpenSSL library\n");
        }
        return false;
    }

    if (std::getenv("HOOK_VERBOSE")) {
        fprintf(stderr, "[hook_windows] OpenSSL library loaded successfully\n");
    }

    // Resolve main hook target functions
    TrueEVP_EncryptInit_ex = reinterpret_cast<decltype(TrueEVP_EncryptInit_ex)>(
        GetProcAddress(hCrypto, "EVP_EncryptInit_ex"));
    TrueEVP_DecryptInit_ex = reinterpret_cast<decltype(TrueEVP_DecryptInit_ex)>(
        GetProcAddress(hCrypto, "EVP_DecryptInit_ex"));
    TrueEVP_CipherInit_ex = reinterpret_cast<decltype(TrueEVP_CipherInit_ex)>(
        GetProcAddress(hCrypto, "EVP_CipherInit_ex"));
    TrueEVP_CIPHER_CTX_ctrl = reinterpret_cast<decltype(TrueEVP_CIPHER_CTX_ctrl)>(
        GetProcAddress(hCrypto, "EVP_CIPHER_CTX_ctrl"));

    // Resolve utility functions
    Dyn_EVP_CIPHER_get0_name = reinterpret_cast<decltype(Dyn_EVP_CIPHER_get0_name)>(
        GetProcAddress(hCrypto, "EVP_CIPHER_get0_name"));
    Dyn_EVP_CIPHER_CTX_get0_cipher = reinterpret_cast<decltype(Dyn_EVP_CIPHER_CTX_get0_cipher)>(
        GetProcAddress(hCrypto, "EVP_CIPHER_CTX_get0_cipher"));
    Dyn_EVP_CIPHER_CTX_cipher = reinterpret_cast<decltype(Dyn_EVP_CIPHER_CTX_cipher)>(
        GetProcAddress(hCrypto, "EVP_CIPHER_CTX_cipher"));
    Dyn_EVP_CIPHER_key_length = reinterpret_cast<decltype(Dyn_EVP_CIPHER_key_length)>(
        GetProcAddress(hCrypto, "EVP_CIPHER_key_length"));
    Dyn_EVP_CIPHER_iv_length = reinterpret_cast<decltype(Dyn_EVP_CIPHER_iv_length)>(
        GetProcAddress(hCrypto, "EVP_CIPHER_iv_length"));
    Dyn_EVP_CIPHER_nid = reinterpret_cast<decltype(Dyn_EVP_CIPHER_nid)>(
        GetProcAddress(hCrypto, "EVP_CIPHER_nid"));
    Dyn_OBJ_nid2sn = reinterpret_cast<decltype(Dyn_OBJ_nid2sn)>(
        GetProcAddress(hCrypto, "OBJ_nid2sn"));

    // Require core functions, but key/iv length functions are optional (may not exist in all OpenSSL versions)
    resolved = (TrueEVP_EncryptInit_ex && TrueEVP_DecryptInit_ex &&
                TrueEVP_CipherInit_ex && TrueEVP_CIPHER_CTX_ctrl &&
                Dyn_EVP_CIPHER_get0_name);

    if (!resolved && std::getenv("HOOK_VERBOSE")) {
        fprintf(stderr, "[hook_windows] Failed to resolve OpenSSL functions:\n");
        if (!TrueEVP_EncryptInit_ex) fprintf(stderr, "[hook_windows]   - EVP_EncryptInit_ex\n");
        if (!TrueEVP_DecryptInit_ex) fprintf(stderr, "[hook_windows]   - EVP_DecryptInit_ex\n");
        if (!TrueEVP_CipherInit_ex) fprintf(stderr, "[hook_windows]   - EVP_CipherInit_ex\n");
        if (!TrueEVP_CIPHER_CTX_ctrl) fprintf(stderr, "[hook_windows]   - EVP_CIPHER_CTX_ctrl\n");
        if (!Dyn_EVP_CIPHER_get0_name) fprintf(stderr, "[hook_windows]   - EVP_CIPHER_get0_name\n");
        if (!Dyn_EVP_CIPHER_key_length) fprintf(stderr, "[hook_windows]   - EVP_CIPHER_key_length\n");
        if (!Dyn_EVP_CIPHER_iv_length) fprintf(stderr, "[hook_windows]   - EVP_CIPHER_iv_length\n");
    }

    return resolved;
}

// ---- Common logging helper ----
static inline void log_init_ex(const char* api, const char* dir,
                              EVP_CIPHER_CTX* ctx, const EVP_CIPHER* type,
                              const unsigned char* key, const unsigned char* iv)
{
    const EVP_CIPHER* c = type ? type : cipher_from_ctx(ctx);
    const char* cname = cipher_name(c);
    int klen = (key && c && Dyn_EVP_CIPHER_key_length) ? Dyn_EVP_CIPHER_key_length(c) : 0;
    int ivlen = (iv && c && Dyn_EVP_CIPHER_iv_length) ? Dyn_EVP_CIPHER_iv_length(c) : 0;

    if (cname) {
        openssl_state_remember(ctx,
                              cname,
                              (key && klen > 0) ? key : nullptr,
                              (key && klen > 0) ? static_cast<size_t>(klen) : 0,
                              (iv && ivlen > 0) ? iv : nullptr,
                              (iv && ivlen > 0) ? static_cast<size_t>(ivlen) : 0);
    }

    ndjson_log_key_event(
        SURFACE, api, dir, cname,
        key, klen,
        iv, ivlen,
        /*tag*/nullptr, 0);
}

// ---- Detoured functions ----
static int WINAPI DetourEVP_EncryptInit_ex(EVP_CIPHER_CTX* ctx,
                                           const EVP_CIPHER* type,
                                           ENGINE* impl,
                                           const unsigned char* key,
                                           const unsigned char* iv)
{
    ReentryGuard guard;
    if (guard) {
        log_init_ex("EVP_EncryptInit_ex", "enc", ctx, type, key, iv);
    }
    return TrueEVP_EncryptInit_ex(ctx, type, impl, key, iv);
}

static int WINAPI DetourEVP_DecryptInit_ex(EVP_CIPHER_CTX* ctx,
                                          const EVP_CIPHER* type,
                                          ENGINE* impl,
                                          const unsigned char* key,
                                          const unsigned char* iv)
{
    ReentryGuard guard;
    if (guard) {
        log_init_ex("EVP_DecryptInit_ex", "dec", ctx, type, key, iv);
    }
    return TrueEVP_DecryptInit_ex(ctx, type, impl, key, iv);
}

static int WINAPI DetourEVP_CipherInit_ex(EVP_CIPHER_CTX* ctx,
                                         const EVP_CIPHER* type,
                                         ENGINE* impl,
                                         const unsigned char* key,
                                         const unsigned char* iv,
                                         int enc)
{
    ReentryGuard guard;
    if (guard) {
        const char* dir = (enc == 1) ? "enc" : (enc == 0) ? "dec" : "cipher";
        log_init_ex("EVP_CipherInit_ex", dir, ctx, type, key, iv);
    }
    return TrueEVP_CipherInit_ex(ctx, type, impl, key, iv, enc);
}

static int WINAPI DetourEVP_CIPHER_CTX_ctrl(EVP_CIPHER_CTX* ctx, int type, int arg, void* ptr)
{
    ReentryGuard guard;

    // Call original first to avoid corrupting state
    int result = TrueEVP_CIPHER_CTX_ctrl(ctx, type, arg, ptr);

    if (guard) {
        // Log GCM tag extraction (EVP_CTRL_GCM_GET_TAG = 16)
        if (type == 16 && ptr && arg > 0) { // EVP_CTRL_GCM_GET_TAG
            OpenSSLState st;
            const char* cname = nullptr;
            if (openssl_state_lookup(ctx, st)) {
                cname = st.cipher_name.c_str();
            } else {
                const EVP_CIPHER* cipher = cipher_from_ctx(ctx);
                cname = cipher ? cipher_name(cipher) : nullptr;
            }

            ndjson_log_key_event(
                SURFACE, "EVP_CIPHER_CTX_ctrl", "tag_get", cname,
                nullptr, 0, nullptr, 0,
                static_cast<const unsigned char*>(ptr), arg);
        }
    }

    return result;
}

// ---- Detours initialization ----
extern "C" {

BOOL InstallOpenSSLHooks()
{
    // First, try to resolve OpenSSL functions dynamically
    if (!ResolveOpenSSLFunctions()) {
        // OpenSSL not loaded yet or not available - hooks will be inactive
        if (std::getenv("HOOK_VERBOSE")) {
            fprintf(stderr, "[hook_windows] OpenSSL functions not found - hooks will not be installed\n");
        }
        return FALSE;
    }

    BOOL success = TRUE;

    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    DetourAttach(&(PVOID&)TrueEVP_EncryptInit_ex, DetourEVP_EncryptInit_ex);
    DetourAttach(&(PVOID&)TrueEVP_DecryptInit_ex, DetourEVP_DecryptInit_ex);
    DetourAttach(&(PVOID&)TrueEVP_CipherInit_ex, DetourEVP_CipherInit_ex);
    DetourAttach(&(PVOID&)TrueEVP_CIPHER_CTX_ctrl, DetourEVP_CIPHER_CTX_ctrl);

    LONG error = DetourTransactionCommit();
    if (error != NO_ERROR) {
        if (std::getenv("HOOK_VERBOSE")) {
            fprintf(stderr, "[hook_windows] DetourTransactionCommit failed with error: %ld\n", error);
        }
        success = FALSE;
    } else {
        if (std::getenv("HOOK_VERBOSE")) {
            fprintf(stderr, "[hook_windows] OpenSSL hooks installed successfully\n");
        }
    }

    return success;
}

BOOL UninstallOpenSSLHooks()
{
    BOOL success = TRUE;

    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    DetourDetach(&(PVOID&)TrueEVP_EncryptInit_ex, DetourEVP_EncryptInit_ex);
    DetourDetach(&(PVOID&)TrueEVP_DecryptInit_ex, DetourEVP_DecryptInit_ex);
    DetourDetach(&(PVOID&)TrueEVP_CipherInit_ex, DetourEVP_CipherInit_ex);
    DetourDetach(&(PVOID&)TrueEVP_CIPHER_CTX_ctrl, DetourEVP_CIPHER_CTX_ctrl);

    LONG error = DetourTransactionCommit();
    if (error != NO_ERROR) {
        success = FALSE;
    }

    return success;
}

} // extern "C"