#include "common/pch.h"
#include "common/output.h"
#include "common/hook_common.h"
#include "platform/linux/log.h"

#include <cstdio>

namespace {

inline bool verbose_mode() {
    const char* env = std::getenv("HOOK_VERBOSE");
    return env && *env == '1';
}

} // namespace

// C linkage for hook_common.h
extern "C" {

void hook_runtime_init(void) {
    ndjson_init_from_env();
}

int hook_is_verbose(void) {
    return verbose_mode() ? 1 : 0;
}

} // extern "C"

__attribute__((constructor))
static void hook_init_ctor() {
    hook_runtime_init();
    if (verbose_mode()) {
        std::fprintf(stderr, "[hook_linux] libhook.so loaded\n");
    }
}

__attribute__((destructor))
static void hook_init_dtor() {
    if (verbose_mode()) {
        std::fprintf(stderr, "[hook_linux] libhook.so unloaded\n");
    }
}

