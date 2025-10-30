// src/platform/windows/hooks/windows_hook_boringssl.cpp - Windows BoringSSL hooks
#include "common/pch.h"
#include "common/output.h"
#include "common/reentry_guard.h"

#include <windows.h>
#include <psapi.h>
#include <detours.h>

#include <algorithm>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#pragma comment(lib, "psapi.lib")

namespace {

constexpr const char* SURFACE = "boringssl";
constexpr size_t kMaxSnapshot = 512;

struct EVP_AEAD_CTX;
struct EVP_AEAD;
struct engine_st;
using ENGINE = engine_st;

using uint8_t = unsigned char;

inline bool verbose_mode() {
    const char* env = std::getenv("HOOK_VERBOSE");
    return env && *env == '1';
}

size_t clamp_len(size_t len) {
    return std::min(len, kMaxSnapshot);
}

std::vector<uint8_t> snapshot_buffer(const uint8_t* data, size_t len) {
    if (!data || len == 0) return {};
    size_t copy_len = std::min(len, kMaxSnapshot);
    std::vector<uint8_t> out(copy_len);
    std::memcpy(out.data(), data, copy_len);
    return out;
}

struct AeadState {
    std::vector<uint8_t> key;
    std::string name;
    size_t tag_len = 0;
};

std::mutex g_state_mu;
std::unordered_map<const EVP_AEAD_CTX*, AeadState> g_states;

size_t(__cdecl* Real_EVP_AEAD_max_overhead)(const EVP_AEAD*) = nullptr;
int(__cdecl* Real_EVP_AEAD_CTX_init)(EVP_AEAD_CTX*, const EVP_AEAD*, const uint8_t*, size_t, size_t, ENGINE*) = nullptr;
void(__cdecl* Real_EVP_AEAD_CTX_cleanup)(EVP_AEAD_CTX*) = nullptr;
int(__cdecl* Real_EVP_AEAD_CTX_seal)(const EVP_AEAD_CTX*, uint8_t*, size_t*, size_t,
                                     const uint8_t*, size_t,
                                     const uint8_t*, size_t,
                                     const uint8_t*, size_t) = nullptr;
int(__cdecl* Real_EVP_AEAD_CTX_open)(const EVP_AEAD_CTX*, uint8_t*, size_t*, size_t,
                                     const uint8_t*, size_t,
                                     const uint8_t*, size_t,
                                     const uint8_t*, size_t) = nullptr;

const EVP_AEAD* (__cdecl* Fn_EVP_aead_aes_256_gcm)() = nullptr;
const EVP_AEAD* (__cdecl* Fn_EVP_aead_aes_128_gcm)() = nullptr;
const EVP_AEAD* (__cdecl* Fn_EVP_aead_chacha20_poly1305)() = nullptr;
const EVP_AEAD* (__cdecl* Fn_EVP_aead_xchacha20_poly1305)() = nullptr;

bool g_hook_init_attached = false;
bool g_hook_cleanup_attached = false;
bool g_hook_seal_attached = false;
bool g_hook_open_attached = false;

const char* describe_aead(const EVP_AEAD* aead) {
    if (!aead) {
        return "AEAD";
    }
    if (Fn_EVP_aead_aes_256_gcm && aead == Fn_EVP_aead_aes_256_gcm()) return "AES-256-GCM";
    if (Fn_EVP_aead_aes_128_gcm && aead == Fn_EVP_aead_aes_128_gcm()) return "AES-128-GCM";
    if (Fn_EVP_aead_chacha20_poly1305 && aead == Fn_EVP_aead_chacha20_poly1305()) return "CHACHA20-POLY1305";
    if (Fn_EVP_aead_xchacha20_poly1305 && aead == Fn_EVP_aead_xchacha20_poly1305()) return "XCHACHA20-POLY1305";
    return "AEAD";
}

void remember_state(const EVP_AEAD_CTX* ctx,
                    const EVP_AEAD* aead,
                    const uint8_t* key,
                    size_t key_len,
                    size_t tag_len) {
    if (!ctx || !aead || !key || key_len == 0) return;

    auto key_copy = snapshot_buffer(key, key_len);
    if (key_copy.empty()) return;

    size_t effective_tag_len = tag_len;
    if (effective_tag_len == 0 && Real_EVP_AEAD_max_overhead) {
        effective_tag_len = Real_EVP_AEAD_max_overhead(aead);
    }

    AeadState state;
    state.key = std::move(key_copy);
    state.name = describe_aead(aead);
    state.tag_len = effective_tag_len;

    std::lock_guard<std::mutex> lock(g_state_mu);
    g_states[ctx] = std::move(state);
}

bool lookup_state(const EVP_AEAD_CTX* ctx, AeadState& out) {
    std::lock_guard<std::mutex> lock(g_state_mu);
    auto it = g_states.find(ctx);
    if (it == g_states.end()) {
        return false;
    }
    out = it->second;
    return true;
}

void forget_state(const EVP_AEAD_CTX* ctx) {
    std::lock_guard<std::mutex> lock(g_state_mu);
    g_states.erase(ctx);
}

void log_event(const char* api,
               const char* direction,
               const AeadState& state,
               const uint8_t* nonce,
               size_t nonce_len,
               const uint8_t* tag,
               size_t tag_len) {
    const unsigned char* key_ptr = state.key.empty() ? nullptr : state.key.data();
    const unsigned char* nonce_ptr = (nonce && nonce_len) ? nonce : nullptr;
    const unsigned char* tag_ptr = (tag && tag_len) ? tag : nullptr;

    ndjson_log_key_event(
        SURFACE,
        api,
        direction,
        state.name.c_str(),
        key_ptr,
        static_cast<int>(state.key.size()),
        nonce_ptr,
        static_cast<int>(nonce_len),
        tag_ptr,
        static_cast<int>(tag_len));
}

FARPROC FindSymbolInProcess(const char* name) {
    HMODULE modules[1024];
    DWORD needed = 0;
    if (!EnumProcessModules(GetCurrentProcess(), modules, sizeof(modules), &needed)) {
        return nullptr;
    }
    size_t count = needed / sizeof(HMODULE);
    for (size_t i = 0; i < count; ++i) {
        HMODULE mod = modules[i];
        FARPROC proc = GetProcAddress(mod, name);
        if (proc) {
            return proc;
        }
    }
    return nullptr;
}

bool resolve_boringssl_symbols() {
    Real_EVP_AEAD_CTX_init = reinterpret_cast<decltype(Real_EVP_AEAD_CTX_init)>(FindSymbolInProcess("EVP_AEAD_CTX_init"));
    Real_EVP_AEAD_CTX_cleanup = reinterpret_cast<decltype(Real_EVP_AEAD_CTX_cleanup)>(FindSymbolInProcess("EVP_AEAD_CTX_cleanup"));
    Real_EVP_AEAD_CTX_seal = reinterpret_cast<decltype(Real_EVP_AEAD_CTX_seal)>(FindSymbolInProcess("EVP_AEAD_CTX_seal"));
    Real_EVP_AEAD_CTX_open = reinterpret_cast<decltype(Real_EVP_AEAD_CTX_open)>(FindSymbolInProcess("EVP_AEAD_CTX_open"));
    Real_EVP_AEAD_max_overhead = reinterpret_cast<decltype(Real_EVP_AEAD_max_overhead)>(FindSymbolInProcess("EVP_AEAD_max_overhead"));

    Fn_EVP_aead_aes_256_gcm = reinterpret_cast<decltype(Fn_EVP_aead_aes_256_gcm)>(FindSymbolInProcess("EVP_aead_aes_256_gcm"));
    Fn_EVP_aead_aes_128_gcm = reinterpret_cast<decltype(Fn_EVP_aead_aes_128_gcm)>(FindSymbolInProcess("EVP_aead_aes_128_gcm"));
    Fn_EVP_aead_chacha20_poly1305 = reinterpret_cast<decltype(Fn_EVP_aead_chacha20_poly1305)>(FindSymbolInProcess("EVP_aead_chacha20_poly1305"));
    Fn_EVP_aead_xchacha20_poly1305 = reinterpret_cast<decltype(Fn_EVP_aead_xchacha20_poly1305)>(FindSymbolInProcess("EVP_aead_xchacha20_poly1305"));

    if (!Real_EVP_AEAD_CTX_init || !Real_EVP_AEAD_CTX_seal || !Real_EVP_AEAD_CTX_open) {
        if (verbose_mode()) {
            fprintf(stderr, "[hook_windows] BoringSSL symbols not found (init=%p seal=%p open=%p)\n",
                    Real_EVP_AEAD_CTX_init,
                    Real_EVP_AEAD_CTX_seal,
                    Real_EVP_AEAD_CTX_open);
        }
        return false;
    }
    return true;
}

int __cdecl Hook_EVP_AEAD_CTX_init(EVP_AEAD_CTX* ctx,
                                   const EVP_AEAD* aead,
                                   const uint8_t* key,
                                   size_t key_len,
                                   size_t tag_len,
                                   ENGINE* engine) {
    if (!Real_EVP_AEAD_CTX_init) {
        return 0;
    }

    ReentryGuard guard;
    if (!guard) {
        return Real_EVP_AEAD_CTX_init(ctx, aead, key, key_len, tag_len, engine);
    }

    int ret = Real_EVP_AEAD_CTX_init(ctx, aead, key, key_len, tag_len, engine);
    if (ret) {
        remember_state(ctx, aead, key, key_len, tag_len);
        AeadState state;
        if (lookup_state(ctx, state)) {
            log_event("EVP_AEAD_CTX_init", "set_key", state, nullptr, 0, nullptr, 0);
        }
    }
    return ret;
}

void __cdecl Hook_EVP_AEAD_CTX_cleanup(EVP_AEAD_CTX* ctx) {
    if (!Real_EVP_AEAD_CTX_cleanup) {
        return;
    }

    ReentryGuard guard;
    if (!guard) {
        Real_EVP_AEAD_CTX_cleanup(ctx);
        return;
    }

    forget_state(ctx);
    Real_EVP_AEAD_CTX_cleanup(ctx);
}

int __cdecl Hook_EVP_AEAD_CTX_seal(const EVP_AEAD_CTX* ctx,
                                   uint8_t* out,
                                   size_t* out_len,
                                   size_t max_out_len,
                                   const uint8_t* nonce,
                                   size_t nonce_len,
                                   const uint8_t* in,
                                   size_t in_len,
                                   const uint8_t* ad,
                                   size_t ad_len) {
    if (!Real_EVP_AEAD_CTX_seal) {
        return 0;
    }

    ReentryGuard guard;
    if (!guard) {
        return Real_EVP_AEAD_CTX_seal(ctx, out, out_len, max_out_len, nonce, nonce_len, in, in_len, ad, ad_len);
    }

    AeadState state;
    bool have_state = lookup_state(ctx, state);

    int ret = Real_EVP_AEAD_CTX_seal(ctx, out, out_len, max_out_len, nonce, nonce_len, in, in_len, ad, ad_len);
    if (ret && have_state) {
        size_t nonce_cap = clamp_len(nonce_len);
        const uint8_t* nonce_ptr = (nonce && nonce_cap) ? nonce : nullptr;

        size_t tag_len = state.tag_len;
        if ((!tag_len || tag_len > kMaxSnapshot) && out && out_len && *out_len > 0) {
            tag_len = std::min(*out_len, static_cast<size_t>(kMaxSnapshot));
        }

        std::vector<uint8_t> tag_snapshot;
        if (out && out_len && tag_len > 0 && *out_len >= tag_len) {
            const uint8_t* tag_ptr = out + (*out_len - tag_len);
            tag_snapshot = snapshot_buffer(tag_ptr, tag_len);
        }

        log_event("EVP_AEAD_CTX_seal",
                  "enc",
                  state,
                  nonce_ptr,
                  nonce_ptr ? nonce_cap : 0,
                  tag_snapshot.empty() ? nullptr : tag_snapshot.data(),
                  tag_snapshot.size());
    }
    return ret;
}

int __cdecl Hook_EVP_AEAD_CTX_open(const EVP_AEAD_CTX* ctx,
                                   uint8_t* out,
                                   size_t* out_len,
                                   size_t max_out_len,
                                   const uint8_t* nonce,
                                   size_t nonce_len,
                                   const uint8_t* in,
                                   size_t in_len,
                                   const uint8_t* ad,
                                   size_t ad_len) {
    if (!Real_EVP_AEAD_CTX_open) {
        return 0;
    }

    ReentryGuard guard;
    if (!guard) {
        return Real_EVP_AEAD_CTX_open(ctx, out, out_len, max_out_len, nonce, nonce_len, in, in_len, ad, ad_len);
    }

    AeadState state;
    bool have_state = lookup_state(ctx, state);

    int ret = Real_EVP_AEAD_CTX_open(ctx, out, out_len, max_out_len, nonce, nonce_len, in, in_len, ad, ad_len);
    if (ret && have_state) {
        size_t nonce_cap = clamp_len(nonce_len);
        const uint8_t* nonce_ptr = (nonce && nonce_cap) ? nonce : nullptr;

        size_t tag_len = state.tag_len;
        if ((!tag_len || tag_len > kMaxSnapshot) && in && in_len > 0) {
            tag_len = std::min(in_len, static_cast<size_t>(kMaxSnapshot));
        }

        std::vector<uint8_t> tag_snapshot;
        if (in && tag_len > 0 && in_len >= tag_len) {
            const uint8_t* tag_ptr = in + (in_len - tag_len);
            tag_snapshot = snapshot_buffer(tag_ptr, tag_len);
        }

        log_event("EVP_AEAD_CTX_open",
                  "dec",
                  state,
                  nonce_ptr,
                  nonce_ptr ? nonce_cap : 0,
                  tag_snapshot.empty() ? nullptr : tag_snapshot.data(),
                  tag_snapshot.size());
    }
    return ret;
}

} // namespace

extern "C" {

BOOL InstallBoringSSLHooks() {
    if (!resolve_boringssl_symbols()) {
        return FALSE;
    }

    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    bool attached_any = false;

    if (Real_EVP_AEAD_CTX_init) {
        LONG err = DetourAttach(reinterpret_cast<PVOID*>(&Real_EVP_AEAD_CTX_init), Hook_EVP_AEAD_CTX_init);
        if (err == NO_ERROR) {
            g_hook_init_attached = true;
            attached_any = true;
        } else if (verbose_mode()) {
            fprintf(stderr, "[hook_windows] Failed to attach EVP_AEAD_CTX_init (error=%ld)\n", err);
        }
    }

    if (Real_EVP_AEAD_CTX_cleanup) {
        LONG err = DetourAttach(reinterpret_cast<PVOID*>(&Real_EVP_AEAD_CTX_cleanup), Hook_EVP_AEAD_CTX_cleanup);
        if (err == NO_ERROR) {
            g_hook_cleanup_attached = true;
            attached_any = true;
        } else if (verbose_mode()) {
            fprintf(stderr, "[hook_windows] Failed to attach EVP_AEAD_CTX_cleanup (error=%ld)\n", err);
        }
    }

    if (Real_EVP_AEAD_CTX_seal) {
        LONG err = DetourAttach(reinterpret_cast<PVOID*>(&Real_EVP_AEAD_CTX_seal), Hook_EVP_AEAD_CTX_seal);
        if (err == NO_ERROR) {
            g_hook_seal_attached = true;
            attached_any = true;
        } else if (verbose_mode()) {
            fprintf(stderr, "[hook_windows] Failed to attach EVP_AEAD_CTX_seal (error=%ld)\n", err);
        }
    }

    if (Real_EVP_AEAD_CTX_open) {
        LONG err = DetourAttach(reinterpret_cast<PVOID*>(&Real_EVP_AEAD_CTX_open), Hook_EVP_AEAD_CTX_open);
        if (err == NO_ERROR) {
            g_hook_open_attached = true;
            attached_any = true;
        } else if (verbose_mode()) {
            fprintf(stderr, "[hook_windows] Failed to attach EVP_AEAD_CTX_open (error=%ld)\n", err);
        }
    }

    if (!attached_any) {
        DetourTransactionAbort();
        return FALSE;
    }

    LONG commit_result = DetourTransactionCommit();
    if (commit_result != NO_ERROR) {
        if (verbose_mode()) {
            fprintf(stderr, "[hook_windows] Failed to commit BoringSSL detours (error=%ld)\n", commit_result);
        }
        return FALSE;
    }

    if (verbose_mode()) {
        fprintf(stderr, "[hook_windows] BoringSSL hooks installed successfully\n");
    }
    return TRUE;
}

BOOL UninstallBoringSSLHooks() {
    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    if (g_hook_init_attached && Real_EVP_AEAD_CTX_init) {
        DetourDetach(reinterpret_cast<PVOID*>(&Real_EVP_AEAD_CTX_init), Hook_EVP_AEAD_CTX_init);
        g_hook_init_attached = false;
    }
    if (g_hook_cleanup_attached && Real_EVP_AEAD_CTX_cleanup) {
        DetourDetach(reinterpret_cast<PVOID*>(&Real_EVP_AEAD_CTX_cleanup), Hook_EVP_AEAD_CTX_cleanup);
        g_hook_cleanup_attached = false;
    }
    if (g_hook_seal_attached && Real_EVP_AEAD_CTX_seal) {
        DetourDetach(reinterpret_cast<PVOID*>(&Real_EVP_AEAD_CTX_seal), Hook_EVP_AEAD_CTX_seal);
        g_hook_seal_attached = false;
    }
    if (g_hook_open_attached && Real_EVP_AEAD_CTX_open) {
        DetourDetach(reinterpret_cast<PVOID*>(&Real_EVP_AEAD_CTX_open), Hook_EVP_AEAD_CTX_open);
        g_hook_open_attached = false;
    }

    DetourTransactionCommit();

    {
        std::lock_guard<std::mutex> lock(g_state_mu);
        g_states.clear();
    }

    if (verbose_mode()) {
        fprintf(stderr, "[hook_windows] BoringSSL hooks uninstalled\n");
    }
    return TRUE;
}

} // extern "C"
