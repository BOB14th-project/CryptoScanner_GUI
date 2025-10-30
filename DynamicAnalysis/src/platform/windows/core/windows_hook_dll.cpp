// src/platform/windows/core/windows_hook_dll.cpp - Windows DLL entry point
#include "common/pch.h"
#include "common/output.h"
#include "common/reentry_guard.h"

#include <windows.h>
#include <detours.h>
#include <cstdio>
#include <string>

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

    BOOL InstallBcryptHooks();
    BOOL UninstallBcryptHooks();
}

namespace {

inline bool verbose_mode() {
    const char* env = std::getenv("HOOK_VERBOSE");
    return env && *env == '1';
}

static std::string get_hook_library_path() {
    std::string path;
    DWORD needed = GetEnvironmentVariableA("HOOK_LIBRARY_PATH", nullptr, 0);
    if (needed == 0) {
        return path;
    }
    std::string buffer;
    buffer.resize(static_cast<size_t>(needed));
    DWORD written = GetEnvironmentVariableA("HOOK_LIBRARY_PATH", buffer.data(), needed);
    if (written == 0 || written >= needed) {
        return {};
    }
    // Trim trailing null if present
    if (!buffer.empty() && buffer.back() == '\0') {
        buffer.pop_back();
    }
    path = buffer;
    return path;
}

static BOOL (WINAPI* TrueCreateProcessW)(LPCWSTR, LPWSTR, LPSECURITY_ATTRIBUTES, LPSECURITY_ATTRIBUTES,
                                         BOOL, DWORD, LPVOID, LPCWSTR, LPSTARTUPINFOW, LPPROCESS_INFORMATION) = CreateProcessW;
static BOOL (WINAPI* TrueCreateProcessA)(LPCSTR, LPSTR, LPSECURITY_ATTRIBUTES, LPSECURITY_ATTRIBUTES,
                                         BOOL, DWORD, LPVOID, LPCSTR, LPSTARTUPINFOA, LPPROCESS_INFORMATION) = CreateProcessA;

static BOOL WINAPI HookCreateProcessW(LPCWSTR lpApplicationName,
                                      LPWSTR lpCommandLine,
                                      LPSECURITY_ATTRIBUTES lpProcessAttributes,
                                      LPSECURITY_ATTRIBUTES lpThreadAttributes,
                                      BOOL bInheritHandles,
                                      DWORD dwCreationFlags,
                                      LPVOID lpEnvironment,
                                      LPCWSTR lpCurrentDirectory,
                                      LPSTARTUPINFOW lpStartupInfo,
                                      LPPROCESS_INFORMATION lpProcessInformation) {
    ReentryGuard guard;
    if (!guard) {
        return TrueCreateProcessW(lpApplicationName, lpCommandLine, lpProcessAttributes, lpThreadAttributes,
                                  bInheritHandles, dwCreationFlags, lpEnvironment, lpCurrentDirectory,
                                  lpStartupInfo, lpProcessInformation);
    }

    std::string dll_path = get_hook_library_path();
    if (dll_path.empty()) {
        return TrueCreateProcessW(lpApplicationName, lpCommandLine, lpProcessAttributes, lpThreadAttributes,
                                  bInheritHandles, dwCreationFlags, lpEnvironment, lpCurrentDirectory,
                                  lpStartupInfo, lpProcessInformation);
    }

    BOOL result = DetourCreateProcessWithDllW(
        lpApplicationName,
        lpCommandLine,
        lpProcessAttributes,
        lpThreadAttributes,
        bInheritHandles,
        dwCreationFlags,
        lpEnvironment,
        lpCurrentDirectory,
        lpStartupInfo,
        lpProcessInformation,
        dll_path.c_str(),
        TrueCreateProcessW);

    if (!result && verbose_mode()) {
        DWORD err = GetLastError();
        fprintf(stderr, "[hook_windows] DetourCreateProcessWithDllW failed for child process (error=%lu)\n", err);
    }
    return result;
}

static BOOL WINAPI HookCreateProcessA(LPCSTR lpApplicationName,
                                      LPSTR lpCommandLine,
                                      LPSECURITY_ATTRIBUTES lpProcessAttributes,
                                      LPSECURITY_ATTRIBUTES lpThreadAttributes,
                                      BOOL bInheritHandles,
                                      DWORD dwCreationFlags,
                                      LPVOID lpEnvironment,
                                      LPCSTR lpCurrentDirectory,
                                      LPSTARTUPINFOA lpStartupInfo,
                                      LPPROCESS_INFORMATION lpProcessInformation) {
    ReentryGuard guard;
    if (!guard) {
        return TrueCreateProcessA(lpApplicationName, lpCommandLine, lpProcessAttributes, lpThreadAttributes,
                                  bInheritHandles, dwCreationFlags, lpEnvironment, lpCurrentDirectory,
                                  lpStartupInfo, lpProcessInformation);
    }

    std::string dll_path = get_hook_library_path();
    if (dll_path.empty()) {
        return TrueCreateProcessA(lpApplicationName, lpCommandLine, lpProcessAttributes, lpThreadAttributes,
                                  bInheritHandles, dwCreationFlags, lpEnvironment, lpCurrentDirectory,
                                  lpStartupInfo, lpProcessInformation);
    }

    BOOL result = DetourCreateProcessWithDllA(
        lpApplicationName,
        lpCommandLine,
        lpProcessAttributes,
        lpThreadAttributes,
        bInheritHandles,
        dwCreationFlags,
        lpEnvironment,
        lpCurrentDirectory,
        lpStartupInfo,
        lpProcessInformation,
        dll_path.c_str(),
        TrueCreateProcessA);

    if (!result && verbose_mode()) {
        DWORD err = GetLastError();
        fprintf(stderr, "[hook_windows] DetourCreateProcessWithDllA failed for child process (error=%lu)\n", err);
    }
    return result;
}

static BOOL InstallProcessHooks() {
    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());

    LONG error = DetourAttach(&(PVOID&)TrueCreateProcessW, HookCreateProcessW);
    if (error != NO_ERROR) {
        DetourTransactionAbort();
        if (verbose_mode()) {
            fprintf(stderr, "[hook_windows] Failed to attach CreateProcessW hook (error=%ld)\n", error);
        }
        return FALSE;
    }
    error = DetourAttach(&(PVOID&)TrueCreateProcessA, HookCreateProcessA);
    if (error != NO_ERROR) {
        DetourTransactionAbort();
        if (verbose_mode()) {
            fprintf(stderr, "[hook_windows] Failed to attach CreateProcessA hook (error=%ld)\n", error);
        }
        return FALSE;
    }

    error = DetourTransactionCommit();
    if (error != NO_ERROR) {
        if (verbose_mode()) {
            fprintf(stderr, "[hook_windows] Failed to commit process hook transaction (error=%ld)\n", error);
        }
        return FALSE;
    }
    return TRUE;
}

static void UninstallProcessHooks() {
    DetourTransactionBegin();
    DetourUpdateThread(GetCurrentThread());
    DetourDetach(&(PVOID&)TrueCreateProcessW, HookCreateProcessW);
    DetourDetach(&(PVOID&)TrueCreateProcessA, HookCreateProcessA);
    DetourTransactionCommit();
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

        InstallProcessHooks();

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
        InstallBcryptHooks();

        if (verbose_mode()) {
            fprintf(stderr, "[hook_windows] hook.dll loaded and hooks installed\n");
        }
        break;

    case DLL_PROCESS_DETACH:
        // Uninstall hooks in reverse order
        UninstallBoringSSLHooks();
        UninstallBcryptHooks();
        UninstallNSSHooks();
        UninstallGnuTLSHooks();
        UninstallWolfSSLHooks();
        UninstallMbedTLSHooks();
        UninstallLibsodiumHooks();
        UninstallPyCryptodomeHooks();

        UninstallProcessHooks();

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
