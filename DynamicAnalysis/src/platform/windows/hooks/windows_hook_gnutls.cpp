// src/platform/windows/hooks/windows_hook_gnutls.cpp - Windows GnuTLS hooks
#include "common/pch.h"
#include "common/output.h"
#include "common/reentry_guard.h"

#include <windows.h>
#include <detours.h>

static constexpr const char* SURFACE = "gnutls";

// GnuTLS is not commonly available on Windows by default
// This is a placeholder for future implementation

extern "C" {

BOOL InstallGnuTLSHooks()
{
    // Placeholder - GnuTLS hooking on Windows requires:
    // 1. gnutls.dll to be present
    // 2. Dynamic loading and symbol resolution
    // 3. Detours setup for gnutls_* functions
    return TRUE;
}

BOOL UninstallGnuTLSHooks()
{
    // Placeholder
    return TRUE;
}

} // extern "C"
