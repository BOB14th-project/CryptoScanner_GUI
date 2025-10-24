// src/platform/windows/hooks/windows_hook_openssl_provider.cpp - Windows version
#include "common/pch.h"
#include "common/output.h"
#include "common/reentry_guard.h"
#include "common/hook_openssl_state.h"

#include <windows.h>
#include <detours.h>
#include <openssl/evp.h>

#if OPENSSL_VERSION_NUMBER >= 0x30000000L
#include <openssl/params.h>
#include <openssl/core_names.h>
#include <cstring>
#include <vector>
#include <string>

static constexpr const char* SURFACE = "openssl";

// ---- Cipher utility functions ----
static inline const char* cipher_name(const EVP_CIPHER* c) {
    return c ? EVP_CIPHER_get0_name(c) : nullptr;
}

static inline const EVP_CIPHER* cipher_from_ctx(const EVP_CIPHER_CTX* ctx) {
    return ctx ? EVP_CIPHER_CTX_get0_cipher(ctx) : nullptr;
}

// ---- Original function pointers for OpenSSL 3.x ex2 API ----
using fn_EncryptInit_ex2 = int(*)(EVP_CIPHER_CTX*, const EVP_CIPHER*,
                                  const unsigned char*, const unsigned char*,
                                  const OSSL_PARAM*);
using fn_DecryptInit_ex2 = int(*)(EVP_CIPHER_CTX*, const EVP_CIPHER*,
                                  const unsigned char*, const unsigned char*,
                                  const OSSL_PARAM*);
using fn_CipherInit_ex2  = int(*)(EVP_CIPHER_CTX*, const EVP_CIPHER*,
                                  const unsigned char*, const unsigned char*,
                                  int, const OSSL_PARAM*);

static fn_EncryptInit_ex2 TrueEVP_EncryptInit_ex2 = EVP_EncryptInit_ex2;
static fn_DecryptInit_ex2 TrueEVP_DecryptInit_ex2 = EVP_DecryptInit_ex2;
static fn_CipherInit_ex2  TrueEVP_CipherInit_ex2  = EVP_CipherInit_ex2;

using fn_setp = int(*)(EVP_CIPHER_CTX*, const OSSL_PARAM*);
using fn_getp = int(*)(EVP_CIPHER_CTX*, OSSL_PARAM*);
static fn_setp TrueEVP_CIPHER_CTX_set_params = EVP_CIPHER_CTX_set_params;
static fn_getp TrueEVP_CIPHER_CTX_get_params = EVP_CIPHER_CTX_get_params;

// ---- OSSL_PARAM logging ----
static inline void log_params_and_update(const char* api,
                                         EVP_CIPHER_CTX* ctx,
                                         const EVP_CIPHER* type,
                                         const OSSL_PARAM* params) {
    if (!params) return;

    const EVP_CIPHER* cipher = type ? type : cipher_from_ctx(ctx);
    const char* cname = cipher_name(cipher);

    size_t keylen_hint = 0;
    size_t ivlen_hint = 0;
    size_t taglen_hint = 0;
    std::vector<unsigned char> iv_vec;
    std::vector<unsigned char> tag_vec;

    for (const OSSL_PARAM* q = params; q && q->key; ++q) {
        const char* k = q->key;
        if (!k) break;

        if (!std::strcmp(k, OSSL_CIPHER_PARAM_KEYLEN)) {
            OSSL_PARAM_get_size_t(q, &keylen_hint);
        } else if (!std::strcmp(k, OSSL_CIPHER_PARAM_IV)) {
            const void* ptr = nullptr;
            size_t sz = 0;
            if (OSSL_PARAM_get_octet_string_ptr(q, &ptr, &sz) && ptr && sz > 0) {
                iv_vec.assign(static_cast<const unsigned char*>(ptr),
                              static_cast<const unsigned char*>(ptr) + sz);
            }
        } else if (!std::strcmp(k, OSSL_CIPHER_PARAM_IVLEN)) {
            OSSL_PARAM_get_size_t(q, &ivlen_hint);
        } else if (!std::strcmp(k, OSSL_CIPHER_PARAM_AEAD_TAG)) {
            const void* ptr = nullptr;
            size_t sz = 0;
            if (OSSL_PARAM_get_octet_string_ptr(q, &ptr, &sz) && ptr && sz > 0) {
                tag_vec.assign(static_cast<const unsigned char*>(ptr),
                               static_cast<const unsigned char*>(ptr) + sz);
            }
        } else if (!std::strcmp(k, OSSL_CIPHER_PARAM_AEAD_TAGLEN)) {
            OSSL_PARAM_get_size_t(q, &taglen_hint);
        }
    }

    if (ctx && cname && !iv_vec.empty()) {
        openssl_state_remember_iv(ctx, cname, iv_vec.data(), iv_vec.size());
    }

    std::string dir = "params";
    if (keylen_hint) dir += "[keylen=" + std::to_string(keylen_hint) + "]";
    if (ivlen_hint) dir += "[ivlen=" + std::to_string(ivlen_hint) + "]";
    if (taglen_hint) dir += "[taglen=" + std::to_string(taglen_hint) + "]";

    ndjson_log_key_event(SURFACE,
                         api,
                         dir.c_str(),
                         cname,
                         nullptr,
                         0,
                         iv_vec.empty() ? nullptr : iv_vec.data(),
                         static_cast<int>(iv_vec.size()),
                         tag_vec.empty() ? nullptr : tag_vec.data(),
                         static_cast<int>(tag_vec.size()));
}

// ---- Log key/IV from ex2 calls ----
static inline void log_key_iv_from_ex2(const char* api,
                                       EVP_CIPHER_CTX* ctx,
                                       const EVP_CIPHER* type,
                                       const unsigned char* key,
                                       const unsigned char* iv,
                                       const char* dir_hint)
{
    const EVP_CIPHER* c = type ? type : cipher_from_ctx(ctx);
    const char* cname = cipher_name(c);
    int klen = (key && c) ? EVP_CIPHER_key_length(c) : 0;
    int ivlen= (iv  && c) ? EVP_CIPHER_iv_length(c)  : 0;

    if (key || iv) {
        ndjson_log_key_event(SURFACE, api, dir_hint, cname,
                             key, klen, iv, ivlen, nullptr, 0);
    }
}

// ---- Detoured functions ----
static int WINAPI DetourEVP_EncryptInit_ex2(EVP_CIPHER_CTX* ctx,
                                            const EVP_CIPHER* type,
                                            const unsigned char* key,
                                            const unsigned char* iv,
                                            const OSSL_PARAM params[])
{
    ReentryGuard guard;
    if (guard) {
        log_key_iv_from_ex2("EVP_EncryptInit_ex2", ctx, type, key, iv, "enc");
        log_params_and_update("EVP_EncryptInit_ex2", ctx, type, params);
    }
    return TrueEVP_EncryptInit_ex2(ctx, type, key, iv, params);
}

static int WINAPI DetourEVP_DecryptInit_ex2(EVP_CIPHER_CTX* ctx,
                                            const EVP_CIPHER* type,
                                            const unsigned char* key,
                                            const unsigned char* iv,
                                            const OSSL_PARAM params[])
{
    ReentryGuard guard;
    if (guard) {
        log_key_iv_from_ex2("EVP_DecryptInit_ex2", ctx, type, key, iv, "dec");
        log_params_and_update("EVP_DecryptInit_ex2", ctx, type, params);
    }
    return TrueEVP_DecryptInit_ex2(ctx, type, key, iv, params);
}

static int WINAPI DetourEVP_CipherInit_ex2(EVP_CIPHER_CTX* ctx,
                                           const EVP_CIPHER* type,
                                           const unsigned char* key,
                                           const unsigned char* iv,
                                           int enc,
                                           const OSSL_PARAM params[])
{
    ReentryGuard guard;
    if (guard) {
        const char* dir = (enc == 1) ? "enc" : (enc == 0) ? "dec" : "cipher";
        log_key_iv_from_ex2("EVP_CipherInit_ex2", ctx, type, key, iv, dir);
        log_params_and_update("EVP_CipherInit_ex2", ctx, type, params);
    }
    return TrueEVP_CipherInit_ex2(ctx, type, key, iv, enc, params);
}

static int WINAPI DetourEVP_CIPHER_CTX_set_params(EVP_CIPHER_CTX* ctx, const OSSL_PARAM params[])
{
    ReentryGuard guard;
    if (guard) {
        log_params_and_update("EVP_CIPHER_CTX_set_params", ctx, nullptr, params);
    }
    return TrueEVP_CIPHER_CTX_set_params(ctx, params);
}

static int WINAPI DetourEVP_CIPHER_CTX_get_params(EVP_CIPHER_CTX* ctx, OSSL_PARAM params[])
{
    int result = TrueEVP_CIPHER_CTX_get_params(ctx, params);

    ReentryGuard guard;
    if (guard && result > 0) {
        log_params_and_update("EVP_CIPHER_CTX_get_params", ctx, nullptr, params);
    }
    return result;
}

// ---- Detours installation/removal for OpenSSL 3.x provider API ----
extern "C" {

BOOL InstallOpenSSLProviderHooks()
{
    BOOL success = TRUE;

    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    DetourAttach(&(PVOID&)TrueEVP_EncryptInit_ex2, DetourEVP_EncryptInit_ex2);
    DetourAttach(&(PVOID&)TrueEVP_DecryptInit_ex2, DetourEVP_DecryptInit_ex2);
    DetourAttach(&(PVOID&)TrueEVP_CipherInit_ex2, DetourEVP_CipherInit_ex2);
    DetourAttach(&(PVOID&)TrueEVP_CIPHER_CTX_set_params, DetourEVP_CIPHER_CTX_set_params);
    DetourAttach(&(PVOID&)TrueEVP_CIPHER_CTX_get_params, DetourEVP_CIPHER_CTX_get_params);

    LONG error = DetourTransactionCommit();
    if (error != NO_ERROR) {
        success = FALSE;
    }

    return success;
}

BOOL UninstallOpenSSLProviderHooks()
{
    BOOL success = TRUE;

    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    DetourDetach(&(PVOID&)TrueEVP_EncryptInit_ex2, DetourEVP_EncryptInit_ex2);
    DetourDetach(&(PVOID&)TrueEVP_DecryptInit_ex2, DetourEVP_DecryptInit_ex2);
    DetourDetach(&(PVOID&)TrueEVP_CipherInit_ex2, DetourEVP_CipherInit_ex2);
    DetourDetach(&(PVOID&)TrueEVP_CIPHER_CTX_set_params, DetourEVP_CIPHER_CTX_set_params);
    DetourDetach(&(PVOID&)TrueEVP_CIPHER_CTX_get_params, DetourEVP_CIPHER_CTX_get_params);

    LONG error = DetourTransactionCommit();
    if (error != NO_ERROR) {
        success = FALSE;
    }

    return success;
}

} // extern "C"

#endif // OPENSSL_VERSION_NUMBER >= 0x30000000L
