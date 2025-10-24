// src/platform/windows/core/windows_hook_dll.cpp - Windows DLL entry point
#include "common/pch.h"
#include "common/output.h"

#include <windows.h>
#include <detours.h>
#include <cstdio>

// Forward declarations for hook installation/removal
extern "C" {
    // Export a function - required by Detours for DLL injection
    __declspec(dllexport) void HookDllInit() {}

    BOOL InstallOpenSSLHooks();
    BOOL UninstallOpenSSLHooks();

#if OPENSSL_VERSION_NUMBER >= 0x30000000L
    BOOL InstallOpenSSLProviderHooks();
    BOOL UninstallOpenSSLProviderHooks();
    BOOL InstallOpenSSLECCHooks();
    BOOL UninstallOpenSSLECCHooks();
#endif

    BOOL InstallPyCryptodomeHooks();
    BOOL UninstallPyCryptodomeHooks();

    BOOL InstallLibsodiumHooks();
    BOOL UninstallLibsodiumHooks();

    BOOL InstallMbedTLSHooks();
    BOOL UninstallMbedTLSHooks();

    BOOL InstallWolfSSLHooks();
    BOOL UninstallWolfSSLHooks();

    BOOL InstallGnuTLSHooks();
    BOOL UninstallGnuTLSHooks();

    BOOL InstallNSSHooks();
    BOOL UninstallNSSHooks();

    BOOL InstallBoringSSLHooks();
    BOOL UninstallBoringSSLHooks();
}

namespace {

inline bool verbose_mode() {
    const char* env = std::getenv("HOOK_VERBOSE");
    return env && *env == '1';
}

} // namespace

// DLL entry point
BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved)
{
    // Check if this is a Detours helper process - must be first!
    if (DetourIsHelperProcess()) {
        return TRUE;
    }

    switch (ul_reason_for_call)
    {
    case DLL_PROCESS_ATTACH:
        // Restore Detours state after being injected
        DetourRestoreAfterWith();

        // Log DLL attachment to a separate file for debugging
        {
            FILE* f = fopen("C:\\temp\\hook_dll_debug.log", "a");
            if (f) {
                fprintf(f, "[DllMain] DLL_PROCESS_ATTACH started\n");
                fflush(f);
                fclose(f);
            }
        }

        // Initialize output system
        ndjson_init_from_env();

        // Install OpenSSL core hooks
        {
            FILE* f = fopen("C:\\temp\\hook_dll_debug.log", "a");
            if (f) {
                fprintf(f, "[DllMain] Installing OpenSSL hooks\n");
                fflush(f);
                fclose(f);
            }
        }

        if (!InstallOpenSSLHooks()) {
            FILE* f = fopen("C:\\temp\\hook_dll_debug.log", "a");
            if (f) {
                fprintf(f, "[DllMain] Failed to install OpenSSL core hooks\n");
                fflush(f);
                fclose(f);
            }
            if (verbose_mode()) {
                fprintf(stderr, "[hook_windows] Failed to install OpenSSL core hooks\n");
            }
        } else {
            FILE* f = fopen("C:\\temp\\hook_dll_debug.log", "a");
            if (f) {
                fprintf(f, "[DllMain] OpenSSL hooks installed successfully\n");
                fflush(f);
                fclose(f);
            }
        }

#if OPENSSL_VERSION_NUMBER >= 0x30000000L
        // Install OpenSSL 3.x provider hooks
        if (!InstallOpenSSLProviderHooks()) {
            if (verbose_mode()) {
                fprintf(stderr, "[hook_windows] Failed to install OpenSSL provider hooks\n");
            }
        }

        // Install OpenSSL 3.x ECC hooks
        if (!InstallOpenSSLECCHooks()) {
            if (verbose_mode()) {
                fprintf(stderr, "[hook_windows] Failed to install OpenSSL ECC hooks\n");
            }
        }
#endif

        // Install PyCryptodome hooks (if available)
        InstallPyCryptodomeHooks();

        // Install additional crypto library hooks
        InstallLibsodiumHooks();
        InstallMbedTLSHooks();
        InstallWolfSSLHooks();
        InstallGnuTLSHooks();
        InstallNSSHooks();
        InstallBoringSSLHooks();

        if (verbose_mode()) {
            fprintf(stderr, "[hook_windows] hook.dll loaded and hooks installed\n");
        }
        break;

    case DLL_PROCESS_DETACH:
        // Uninstall hooks in reverse order
        UninstallBoringSSLHooks();
        UninstallNSSHooks();
        UninstallGnuTLSHooks();
        UninstallWolfSSLHooks();
        UninstallMbedTLSHooks();
        UninstallLibsodiumHooks();
        UninstallPyCryptodomeHooks();

#if OPENSSL_VERSION_NUMBER >= 0x30000000L
        UninstallOpenSSLECCHooks();
        UninstallOpenSSLProviderHooks();
#endif

        UninstallOpenSSLHooks();

        if (verbose_mode()) {
            fprintf(stderr, "[hook_windows] hook.dll unloaded\n");
        }
        break;

    case DLL_THREAD_ATTACH:
    case DLL_THREAD_DETACH:
        break;
    }
    return TRUE;
}
