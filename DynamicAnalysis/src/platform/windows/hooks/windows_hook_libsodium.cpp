// src/platform/windows/hooks/windows_hook_libsodium.cpp - Windows libsodium hooks
#include "common/pch.h"
#include "common/output.h"
#include "common/reentry_guard.h"

#include <windows.h>
#include <detours.h>

// Note: libsodium is typically not available as a system library on Windows
// This is a placeholder implementation. Actual hooking would require:
// 1. libsodium.dll to be present in the system
// 2. Dynamic loading of libsodium symbols
// 3. Detours hooking setup

static constexpr const char* SURFACE = "libsodium";

namespace {

struct AEADConfig {
    const char* cipher_name;
    size_t key_len;
    size_t nonce_len;
    size_t tag_len;
};

constexpr AEADConfig kChacha20Poly1305Ietf{ "chacha20poly1305-ietf", 32, 12, 16 };
constexpr AEADConfig kXChacha20Poly1305Ietf{ "xchacha20poly1305-ietf", 32, 24, 16 };

void log_event(const AEADConfig& cfg,
               const char* api,
               const char* dir,
               const unsigned char* key,
               size_t key_len,
               const unsigned char* nonce,
               size_t nonce_len,
               const unsigned char* tag,
               size_t tag_len) {
    ndjson_log_key_event(
        SURFACE,
        api,
        dir,
        cfg.cipher_name,
        key_len ? key : nullptr,
        static_cast<int>(key_len),
        nonce_len ? nonce : nullptr,
        static_cast<int>(nonce_len),
        tag_len ? tag : nullptr,
        static_cast<int>(tag_len));
}

} // namespace

// Function pointers for libsodium API
using fn_crypto_aead_chacha20poly1305_ietf_encrypt =
    int (*)(unsigned char*, unsigned long long*, const unsigned char*, unsigned long long,
            const unsigned char*, unsigned long long, const unsigned char*, const unsigned char*, const unsigned char*);
using fn_crypto_aead_chacha20poly1305_ietf_decrypt =
    int (*)(unsigned char*, unsigned long long*, unsigned char*, const unsigned char*, unsigned long long,
            const unsigned char*, unsigned long long, const unsigned char*, const unsigned char*);

static fn_crypto_aead_chacha20poly1305_ietf_encrypt True_crypto_aead_chacha20poly1305_ietf_encrypt = nullptr;
static fn_crypto_aead_chacha20poly1305_ietf_decrypt True_crypto_aead_chacha20poly1305_ietf_decrypt = nullptr;

// Detoured functions
static int WINAPI Detour_crypto_aead_chacha20poly1305_ietf_encrypt(
    unsigned char* c, unsigned long long* clen_p,
    const unsigned char* m, unsigned long long mlen,
    const unsigned char* ad, unsigned long long adlen,
    const unsigned char* nsec, const unsigned char* npub, const unsigned char* k)
{
    if (!True_crypto_aead_chacha20poly1305_ietf_encrypt) return -1;

    ReentryGuard guard;
    int ret = True_crypto_aead_chacha20poly1305_ietf_encrypt(c, clen_p, m, mlen, ad, adlen, nsec, npub, k);

    if (guard && ret == 0) {
        const unsigned char* tag_ptr = nullptr;
        if (c && clen_p && *clen_p >= kChacha20Poly1305Ietf.tag_len) {
            tag_ptr = c + (*clen_p - kChacha20Poly1305Ietf.tag_len);
        }
        log_event(kChacha20Poly1305Ietf,
                  "crypto_aead_chacha20poly1305_ietf_encrypt",
                  "enc",
                  k, k ? kChacha20Poly1305Ietf.key_len : 0,
                  npub, npub ? kChacha20Poly1305Ietf.nonce_len : 0,
                  tag_ptr, tag_ptr ? kChacha20Poly1305Ietf.tag_len : 0);
    }
    return ret;
}

extern "C" {

BOOL InstallLibsodiumHooks()
{
    // libsodium is not commonly available on Windows by default
    // This is a placeholder - actual implementation would require:
    // 1. Loading libsodium.dll dynamically
    // 2. Resolving function addresses
    // 3. Setting up Detours hooks

    HMODULE hLibsodium = GetModuleHandleA("libsodium.dll");
    if (!hLibsodium) {
        // Try to load it
        hLibsodium = LoadLibraryA("libsodium.dll");
    }

    if (!hLibsodium) {
        // libsodium not available, skip silently
        return TRUE;
    }

    True_crypto_aead_chacha20poly1305_ietf_encrypt =
        (fn_crypto_aead_chacha20poly1305_ietf_encrypt)GetProcAddress(hLibsodium, "crypto_aead_chacha20poly1305_ietf_encrypt");

    if (!True_crypto_aead_chacha20poly1305_ietf_encrypt) {
        return TRUE; // Symbol not found, skip
    }

    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    DetourAttach(&(PVOID&)True_crypto_aead_chacha20poly1305_ietf_encrypt, Detour_crypto_aead_chacha20poly1305_ietf_encrypt);

    LONG error = DetourTransactionCommit();
    return (error == NO_ERROR);
}

BOOL UninstallLibsodiumHooks()
{
    if (!True_crypto_aead_chacha20poly1305_ietf_encrypt) {
        return TRUE;
    }

    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    DetourDetach(&(PVOID&)True_crypto_aead_chacha20poly1305_ietf_encrypt, Detour_crypto_aead_chacha20poly1305_ietf_encrypt);

    LONG error = DetourTransactionCommit();
    return (error == NO_ERROR);
}

} // extern "C"
