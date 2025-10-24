// src/platform/windows/hooks/windows_hook_mbedtls.cpp - Windows mbedTLS hooks
#include "common/pch.h"
#include "common/output.h"
#include "common/reentry_guard.h"

#include <windows.h>
#include <detours.h>

static constexpr const char* SURFACE = "mbedtls";

// mbedTLS is not commonly available on Windows by default
// This is a placeholder for future implementation

extern "C" {

BOOL InstallMbedTLSHooks()
{
    // Placeholder - mbedTLS hooking on Windows requires:
    // 1. mbedcrypto.dll to be present
    // 2. Dynamic loading and symbol resolution
    // 3. Detours setup for mbedtls_gcm_* functions
    return TRUE;
}

BOOL UninstallMbedTLSHooks()
{
    // Placeholder
    return TRUE;
}

} // extern "C"
