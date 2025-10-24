// src/platform/windows/hooks/windows_hook_wolfssl.cpp - Windows wolfSSL hooks
#include "common/pch.h"
#include "common/output.h"
#include "common/reentry_guard.h"

#include <windows.h>
#include <detours.h>

static constexpr const char* SURFACE = "wolfssl";

// wolfSSL is not commonly available on Windows by default
// This is a placeholder for future implementation

extern "C" {

BOOL InstallWolfSSLHooks()
{
    // Placeholder - wolfSSL hooking on Windows requires:
    // 1. wolfssl.dll to be present
    // 2. Dynamic loading and symbol resolution
    // 3. Detours setup for wc_* functions
    return TRUE;
}

BOOL UninstallWolfSSLHooks()
{
    // Placeholder
    return TRUE;
}

} // extern "C"
