// src/platform/windows/hooks/windows_hook_openssl_ecc.cpp - Windows ECC hooks
#include "common/pch.h"
#include "common/output.h"
#include "common/reentry_guard.h"

#include <windows.h>
#include <detours.h>
#include <openssl/ec.h>
#include <openssl/ecdsa.h>
#include <openssl/evp.h>
#include <openssl/obj_mac.h>
#include <openssl/objects.h>
#include <openssl/bn.h>

#if OPENSSL_VERSION_NUMBER >= 0x30000000L
#include <openssl/core_names.h>
#endif

#include <vector>
#include <string>

static constexpr const char* SURFACE = "openssl";

namespace {

static inline const char* curve_name(const EC_KEY* key) {
    if (!key) return nullptr;
    const EC_GROUP* group = EC_KEY_get0_group(key);
    if (!group) return nullptr;
    int nid = EC_GROUP_get_curve_name(group);
    return nid != NID_undef ? OBJ_nid2sn(nid) : nullptr;
}

static std::vector<unsigned char> bn_to_bytes(const BIGNUM* bn) {
    std::vector<unsigned char> buf;
    if (!bn) return buf;
    int len = BN_num_bytes(bn);
    if (len <= 0) return buf;
    buf.resize((size_t)len);
    BN_bn2bin(bn, buf.data());
    return buf;
}

#if OPENSSL_VERSION_NUMBER >= 0x30000000L

static bool extract_ec_key_info(EVP_PKEY* pkey,
                                std::vector<unsigned char>& priv_out,
                                std::string& curve_out) {
    priv_out.clear();
    curve_out.clear();
    if (!pkey) return false;
    if (EVP_PKEY_base_id(pkey) != EVP_PKEY_EC) return false;

    char curve_buf[128];
    size_t curve_len = 0;
    if (EVP_PKEY_get_utf8_string_param(pkey,
                                       OSSL_PKEY_PARAM_GROUP_NAME,
                                       curve_buf,
                                       sizeof(curve_buf),
                                       &curve_len) > 0 &&
        curve_len > 0 && curve_len < sizeof(curve_buf)) {
        curve_out.assign(curve_buf, curve_len);
    }

    BIGNUM* priv_bn = nullptr;
    if (EVP_PKEY_get_bn_param(pkey, OSSL_PKEY_PARAM_PRIV_KEY, &priv_bn) > 0 && priv_bn) {
        priv_out = bn_to_bytes(priv_bn);
        BN_free(priv_bn);
    }

    return true;
}

static std::vector<unsigned char> snapshot_digest(EVP_MD_CTX* ctx) {
    std::vector<unsigned char> digest;
    if (!ctx) return digest;
    EVP_MD_CTX* tmp = EVP_MD_CTX_new();
    if (!tmp) return digest;
    if (EVP_MD_CTX_copy_ex(tmp, ctx) <= 0) {
        EVP_MD_CTX_free(tmp);
        return digest;
    }
    unsigned int len = 0;
    digest.resize(EVP_MAX_MD_SIZE);
    if (EVP_DigestFinal_ex(tmp, digest.data(), &len) <= 0) {
        digest.clear();
    } else {
        digest.resize(len);
    }
    EVP_MD_CTX_free(tmp);
    return digest;
}

static EVP_PKEY* md_ctx_get0_pkey(EVP_MD_CTX* ctx) {
    if (!ctx) return nullptr;
    EVP_PKEY_CTX* pctx = EVP_MD_CTX_pkey_ctx(ctx);
    return pctx ? EVP_PKEY_CTX_get0_pkey(pctx) : nullptr;
}

static std::vector<unsigned char> ecdsa_der_to_rs(const unsigned char* sig, size_t sig_len) {
    std::vector<unsigned char> combined;
    if (!sig || sig_len == 0) return combined;
    const unsigned char* p = sig;
    ECDSA_SIG* ec_sig = d2i_ECDSA_SIG(nullptr, &p, (long)sig_len);
    if (!ec_sig) return combined;
    const BIGNUM *r = nullptr, *s = nullptr;
    ECDSA_SIG_get0(ec_sig, &r, &s);
    auto r_bytes = bn_to_bytes(r);
    auto s_bytes = bn_to_bytes(s);
    combined.reserve(r_bytes.size() + s_bytes.size());
    combined.insert(combined.end(), r_bytes.begin(), r_bytes.end());
    combined.insert(combined.end(), s_bytes.begin(), s_bytes.end());
    ECDSA_SIG_free(ec_sig);
    return combined;
}

#endif // OPENSSL_VERSION_NUMBER >= 0x30000000L

} // namespace

// ---- Original function pointers ----
#if OPENSSL_VERSION_NUMBER >= 0x30000000L
using fn_EVP_DigestSignFinal = int(*)(EVP_MD_CTX*, unsigned char*, size_t*);
static fn_EVP_DigestSignFinal TrueEVP_DigestSignFinal = EVP_DigestSignFinal;

using fn_EVP_DigestSign = int(*)(EVP_MD_CTX*, unsigned char*, size_t*, const unsigned char*, size_t);
static fn_EVP_DigestSign TrueEVP_DigestSign = EVP_DigestSign;
#endif

// ---- Detoured functions ----
#if OPENSSL_VERSION_NUMBER >= 0x30000000L

static int WINAPI DetourEVP_DigestSignFinal(EVP_MD_CTX* ctx, unsigned char* sigret, size_t* siglen)
{
    ReentryGuard guard;

    std::vector<unsigned char> digest_snap;
    std::vector<unsigned char> priv_bytes;
    std::string curve_str;

    if (guard) {
        digest_snap = snapshot_digest(ctx);
        EVP_PKEY* pkey = md_ctx_get0_pkey(ctx);
        extract_ec_key_info(pkey, priv_bytes, curve_str);
    }

    int result = TrueEVP_DigestSignFinal(ctx, sigret, siglen);

    if (guard && result > 0 && sigret && siglen && *siglen > 0) {
        auto sig_rs = ecdsa_der_to_rs(sigret, *siglen);
        ndjson_log_key_event(
            SURFACE,
            "EVP_DigestSignFinal",
            "ecc_sign",
            curve_str.empty() ? nullptr : curve_str.c_str(),
            priv_bytes.empty() ? nullptr : priv_bytes.data(),
            static_cast<int>(priv_bytes.size()),
            digest_snap.empty() ? nullptr : digest_snap.data(),
            static_cast<int>(digest_snap.size()),
            sig_rs.empty() ? nullptr : sig_rs.data(),
            static_cast<int>(sig_rs.size()));
    }

    return result;
}

static int WINAPI DetourEVP_DigestSign(EVP_MD_CTX* ctx,
                                       unsigned char* sigret, size_t* siglen,
                                       const unsigned char* tbs, size_t tbslen)
{
    ReentryGuard guard;

    std::vector<unsigned char> priv_bytes;
    std::string curve_str;

    if (guard) {
        EVP_PKEY* pkey = md_ctx_get0_pkey(ctx);
        extract_ec_key_info(pkey, priv_bytes, curve_str);
    }

    int result = TrueEVP_DigestSign(ctx, sigret, siglen, tbs, tbslen);

    if (guard && result > 0 && sigret && siglen && *siglen > 0) {
        auto sig_rs = ecdsa_der_to_rs(sigret, *siglen);
        ndjson_log_key_event(
            SURFACE,
            "EVP_DigestSign",
            "ecc_sign",
            curve_str.empty() ? nullptr : curve_str.c_str(),
            priv_bytes.empty() ? nullptr : priv_bytes.data(),
            static_cast<int>(priv_bytes.size()),
            tbs,
            static_cast<int>(tbslen),
            sig_rs.empty() ? nullptr : sig_rs.data(),
            static_cast<int>(sig_rs.size()));
    }

    return result;
}

#endif // OPENSSL_VERSION_NUMBER >= 0x30000000L

// ---- Detours installation/removal ----
extern "C" {

BOOL InstallOpenSSLECCHooks()
{
#if OPENSSL_VERSION_NUMBER >= 0x30000000L
    BOOL success = TRUE;

    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    DetourAttach(&(PVOID&)TrueEVP_DigestSignFinal, DetourEVP_DigestSignFinal);
    DetourAttach(&(PVOID&)TrueEVP_DigestSign, DetourEVP_DigestSign);

    LONG error = DetourTransactionCommit();
    if (error != NO_ERROR) {
        success = FALSE;
    }

    return success;
#else
    return TRUE; // No hooks for OpenSSL < 3.0
#endif
}

BOOL UninstallOpenSSLECCHooks()
{
#if OPENSSL_VERSION_NUMBER >= 0x30000000L
    BOOL success = TRUE;

    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    DetourDetach(&(PVOID&)TrueEVP_DigestSignFinal, DetourEVP_DigestSignFinal);
    DetourDetach(&(PVOID&)TrueEVP_DigestSign, DetourEVP_DigestSign);

    LONG error = DetourTransactionCommit();
    if (error != NO_ERROR) {
        success = FALSE;
    }

    return success;
#else
    return TRUE;
#endif
}

} // extern "C"
