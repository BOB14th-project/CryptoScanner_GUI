#include "common/pch.h"
#include "common/dynamic_analysis.h"
#include "common/hook_common.h"

#include <filesystem>
#include <fstream>
#include <iostream>
#include <optional>
#include <string>
#include <system_error>
#include <vector>

#include <cerrno>
#include <chrono>
#include <ctime>

#if defined(__linux__)
  #include <sys/stat.h>
  #include <sys/types.h>
  #include <sys/wait.h>
  #include <unistd.h>
#elif defined(_WIN32) || defined(_WIN64)
  #include <windows.h>
  #include <detours.h>
#elif defined(__APPLE__) && defined(__MACH__)
  #include <mach-o/dyld.h>
  #include <sys/stat.h>
  #include <sys/types.h>
  #include <sys/wait.h>
  #include <signal.h>
  #include <unistd.h>
#endif

namespace {

enum class HostOS {
    Linux,
    Windows,
    MacOS,
    Unsupported
};

static std::string make_timestamp_suffix() {
    using clock = std::chrono::system_clock;
    auto now = clock::now();
    std::time_t tt = clock::to_time_t(now);
    std::tm tm{};
#if defined(_WIN32) || defined(_WIN64)
    localtime_s(&tm, &tt);
#else
    localtime_r(&tt, &tm);
#endif
    char buf[32];
    if (std::strftime(buf, sizeof(buf), "%Y%m%d_%H%M%S", &tm) == 0) {
        return "unknown";
    }
    return buf;
}

static std::filesystem::path default_log_path(const std::filesystem::path& binary_name) {
    namespace fs = std::filesystem;
    std::error_code ec;

    // Use /tmp instead of current_path() to avoid permission issues when running with sudo
    fs::path logs_dir = fs::path("/tmp") / "crypto_scanner_logs";
    fs::create_directories(logs_dir, ec);

    fs::path stem_path = binary_name;
    if (stem_path.has_extension()) {
        stem_path = stem_path.stem();
    } else {
        stem_path = stem_path.filename();
    }
    std::string stem = stem_path.string();
    if (stem.empty()) {
        stem = "target";
    }
    std::string log_filename = stem + "_" + make_timestamp_suffix() + ".ndjson";
    return logs_dir / log_filename;
}

static HostOS detect_host_os() {
#if defined(_WIN32) || defined(_WIN64)
    return HostOS::Windows;
#elif defined(__linux__)
    return HostOS::Linux;
#elif defined(__APPLE__) && defined(__MACH__)
    return HostOS::MacOS;
#else
    return HostOS::Unsupported;
#endif
}

#if defined(__linux__)
static std::filesystem::path locate_hook_library() {
    namespace fs = std::filesystem;
    std::vector<fs::path> candidates;

    if (const char* env = std::getenv("HOOK_LIBRARY_PATH")) {
        if (*env) candidates.emplace_back(env);
    }

    std::error_code ec;
    fs::path exe_path = fs::read_symlink("/proc/self/exe", ec);
    if (!ec) {
        fs::path bin_dir = exe_path.parent_path();
        if (!bin_dir.empty()) {
            // First check in the same directory as the binary
            candidates.emplace_back(bin_dir / "libhook.so");

            // Then check in parent directory structure
            fs::path build_dir = bin_dir.parent_path();
            if (!build_dir.empty()) {
                candidates.emplace_back(build_dir / "lib" / "libhook.so");
                candidates.emplace_back(build_dir / "libhook.so");
            }
        }
    }

    // Skip current_path() based search when running with elevated privileges
    // to avoid permission issues

    for (const auto& candidate : candidates) {
        if (candidate.empty()) continue;
        std::error_code exists_ec;
        if (std::filesystem::exists(candidate, exists_ec) && !exists_ec) {
            std::error_code canon_ec;
            auto canonical_path = std::filesystem::canonical(candidate, canon_ec);
            return canon_ec ? std::filesystem::absolute(candidate) : canonical_path;
        }
    }
    return {};
}

static bool is_executable(const std::filesystem::path& target) {
    struct stat st;
    if (stat(target.c_str(), &st) != 0) return false;
    return (st.st_mode & S_IXUSR) != 0;
}

static int run_linux_dynamic_analysis(const std::filesystem::path& directory,
                                      const std::filesystem::path& binary) {
    namespace fs = std::filesystem;

    fs::path target = directory.empty() ? binary : directory / binary;
    std::error_code ec;
    target = fs::weakly_canonical(target, ec);
    if (ec) target = fs::absolute(target);

    if (!fs::exists(target)) {
        std::cerr << "[dynamic_analysis] target not found: " << target << '\n';
        return 1;
    }
    if (!is_executable(target)) {
        std::cerr << "[dynamic_analysis] target is not executable: " << target << '\n';
        return 1;
    }

    fs::path hook = locate_hook_library();
    if (hook.empty() || !fs::exists(hook)) {
        std::cerr << "[dynamic_analysis] unable to locate libhook.so" << '\n';
        return 1;
    }

    fs::path log_file;
    if (const char* existing = std::getenv("HOOK_NDJSON"); existing && *existing) {
        log_file = existing;
    } else {
        log_file = default_log_path(binary.filename());
    }
    if (!log_file.parent_path().empty()) {
        fs::create_directories(log_file.parent_path());
    }
    std::error_code remove_ec;
    fs::remove(log_file, remove_ec);

    auto capture_env = [](const char* key) {
        const char* value = std::getenv(key);
        return value ? std::optional<std::string>(value) : std::nullopt;
    };
    auto restore_env = [](const char* key, const std::optional<std::string>& value) {
        if (value.has_value()) {
            setenv(key, value->c_str(), 1);
        } else {
            unsetenv(key);
        }
    };

    std::optional<std::string> prev_ld_preload = capture_env("LD_PRELOAD");
    std::optional<std::string> prev_hook_verbose = capture_env(HOOK_ENV_VERBOSE);
    std::optional<std::string> prev_hook_ndjson = capture_env("HOOK_NDJSON");

    setenv("LD_PRELOAD", hook.c_str(), 1);
    setenv(HOOK_ENV_VERBOSE, "1", 1);
    setenv("HOOK_NDJSON", log_file.c_str(), 1);

    std::cout << "[dynamic_analysis] host: Linux" << '\n';
    std::cout << "[dynamic_analysis] preload: " << hook << '\n';
    std::cout << "[dynamic_analysis] target:  " << target << '\n';
    std::cout << "[dynamic_analysis] log:     " << log_file << '\n';

    pid_t pid = fork();
    if (pid == 0) {
        execl(target.c_str(), target.c_str(), static_cast<char*>(nullptr));
        perror("execl");
        _exit(errno ? errno : 1);
    }
    if (pid < 0) {
        perror("fork");
        restore_env("LD_PRELOAD", prev_ld_preload);
        restore_env(HOOK_ENV_VERBOSE, prev_hook_verbose);
        restore_env("HOOK_NDJSON", prev_hook_ndjson);
        return 1;
    }

    int status = 0;
    if (waitpid(pid, &status, 0) < 0) {
        perror("waitpid");
        restore_env("LD_PRELOAD", prev_ld_preload);
        restore_env(HOOK_ENV_VERBOSE, prev_hook_verbose);
        restore_env("HOOK_NDJSON", prev_hook_ndjson);
        return 1;
    }

    restore_env("LD_PRELOAD", prev_ld_preload);
    restore_env(HOOK_ENV_VERBOSE, prev_hook_verbose);
    restore_env("HOOK_NDJSON", prev_hook_ndjson);

    if (WIFEXITED(status)) {
        std::cout << "[dynamic_analysis] child exit code: " << WEXITSTATUS(status) << '\n';
    } else if (WIFSIGNALED(status)) {
        std::cout << "[dynamic_analysis] child terminated by signal: " << WTERMSIG(status) << '\n';
    }

    std::ifstream in(log_file);
    if (!in.good()) {
        std::cout << "[dynamic_analysis] no hook output written." << '\n';
        return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
    }

    std::cout << "[dynamic_analysis] captured events:" << '\n';
    std::string line;
    while (std::getline(in, line)) {
        std::cout << line << '\n';
    }
    return WIFEXITED(status) ? WEXITSTATUS(status) : 0;
}
#endif

#if defined(__APPLE__) && defined(__MACH__)
static std::filesystem::path locate_hook_library() {
    namespace fs = std::filesystem;
    std::vector<fs::path> candidates;

    if (const char* env = std::getenv("HOOK_LIBRARY_PATH")) {
        if (*env) candidates.emplace_back(env);
    }

    std::error_code ec;
    char exe_path_buf[1024];
    uint32_t size = sizeof(exe_path_buf);
    if (_NSGetExecutablePath(exe_path_buf, &size) == 0) {
        fs::path exe_path = fs::absolute(exe_path_buf, ec);
        if (!ec) {
            fs::path bin_dir = exe_path.parent_path();
            if (!bin_dir.empty()) {
                // First check in the same directory as the binary
                candidates.emplace_back(bin_dir / "libhook.dylib");

                // Then check in parent directory structure
                fs::path build_dir = bin_dir.parent_path();
                if (!build_dir.empty()) {
                    candidates.emplace_back(build_dir / "lib" / "libhook.dylib");
                    candidates.emplace_back(build_dir / "libhook.dylib");
                }
            }
        }
    }

    // Skip current_path() based search when running with elevated privileges
    // to avoid permission issues

    for (const auto& candidate : candidates) {
        if (candidate.empty()) continue;
        std::error_code exists_ec;
        if (std::filesystem::exists(candidate, exists_ec) && !exists_ec) {
            std::error_code canon_ec;
            auto canonical_path = std::filesystem::canonical(candidate, canon_ec);
            return canon_ec ? std::filesystem::absolute(candidate) : canonical_path;
        }
    }
    return {};
}

static bool is_executable(const std::filesystem::path& target) {
    struct stat st;
    if (stat(target.c_str(), &st) != 0) return false;
    return (st.st_mode & S_IXUSR) != 0;
}

// DTrace-based approach for monitoring running processes
static int run_macos_dtrace_analysis(const std::filesystem::path& target,
                                      const std::filesystem::path& log_file) {
    namespace fs = std::filesystem;

    // Check if ORIGINAL target is sandboxed (before any copying/re-signing)
    bool is_sandboxed = false;
    std::string codesign_output_file = "/tmp/codesign_check_" + std::to_string(getpid()) + ".txt";
    std::string codesign_cmd = "codesign -d --entitlements :- \"" + target.string() + "\" 2>&1 > \"" + codesign_output_file + "\"";
    system(codesign_cmd.c_str());

    // Read output and check for sandbox
    std::ifstream codesign_file(codesign_output_file);
    if (codesign_file.good()) {
        std::string content((std::istreambuf_iterator<char>(codesign_file)),
                           std::istreambuf_iterator<char>());
        codesign_file.close();

        // Check if sandbox entitlement is present and set to true
        // Pattern: <key>com.apple.security.app-sandbox</key><true/>
        if (content.find("com.apple.security.app-sandbox") != std::string::npos &&
            content.find("<true/>") != std::string::npos) {
            is_sandboxed = true;
        }

        std::remove(codesign_output_file.c_str());
    }

    // Write sandbox status to stderr (which is captured) and to log file
    if (is_sandboxed) {
        std::cerr << "[dynamic_analysis] detected sandboxed app, using sandbox-safe DTrace script" << std::endl;
    } else {
        std::cerr << "[dynamic_analysis] app is not sandboxed, using standard DTrace script" << std::endl;
    }

    // Locate DTrace script (choose based on ORIGINAL app's sandbox status)
    // Note: We check the original app, not the unsigned copy, because the copy
    // will have sandbox removed but we still need the sandbox-safe script
    std::string script_name = is_sandboxed ? "macos_crypto_trace_sandbox.d" : "macos_crypto_trace.d";
    std::vector<fs::path> script_candidates;

    // Check /tmp first (where script is copied for elevated access)
    script_candidates.emplace_back(fs::path("/tmp") / script_name);

    char exe_path_buf[1024];
    uint32_t size = sizeof(exe_path_buf);
    if (_NSGetExecutablePath(exe_path_buf, &size) == 0) {
        std::error_code ec;
        fs::path exe_path = fs::absolute(exe_path_buf, ec);
        if (!ec) {
            fs::path bin_dir = exe_path.parent_path();
            script_candidates.emplace_back(bin_dir / script_name);
            script_candidates.emplace_back(bin_dir.parent_path() / "scripts" / script_name);
        }
    }

    // Skip current_path() based search when running with elevated privileges
    // to avoid permission issues

    fs::path dtrace_script;
    for (const auto& candidate : script_candidates) {
        std::error_code ec;
        if (fs::exists(candidate, ec) && !ec) {
            dtrace_script = candidate;
            break;
        }
    }

    if (dtrace_script.empty()) {
        std::cerr << "[dynamic_analysis] unable to locate " << script_name << " script" << '\n';
        return 1;
    }

    std::cerr << "[dynamic_analysis] host: macOS (DTrace)" << std::endl;
    std::cerr << "[dynamic_analysis] script: " << dtrace_script << std::endl;
    std::cerr << "[dynamic_analysis] target:  " << target << std::endl;
    std::cerr << "[dynamic_analysis] log:     " << log_file << std::endl;

    // Check if target is in SIP-protected location
    std::string target_path = target.string();
    bool is_sip_protected = (target_path.find("/Applications/") == 0 ||
                            target_path.find("/System/") == 0);

    std::string app_bundle_path;
    std::string temp_dir_path;
    fs::path unsigned_app_bundle;
    bool need_cleanup = false;

    // Find app bundle path
    size_t app_pos = target_path.find(".app/");
    if (app_pos != std::string::npos) {
        app_bundle_path = target_path.substr(0, app_pos + 4);
    }

    // For SIP-protected apps, copy and re-sign with ad-hoc signature
    if (is_sip_protected && !app_bundle_path.empty()) {
        std::cout << "[dynamic_analysis] SIP-protected app detected, creating unsigned copy..." << '\n';

        std::string app_name = fs::path(app_bundle_path).filename().string();
        temp_dir_path = "/tmp/crypto_scan_" + std::to_string(getpid());

        // Create temp directory
        std::string mkdir_cmd = "mkdir -p \"" + temp_dir_path + "\" 2>&1";
        system(mkdir_cmd.c_str());

        // Copy app bundle
        std::string copy_cmd = "cp -R \"" + app_bundle_path + "\" \"" + temp_dir_path + "/\" 2>&1";
        std::cout << "[dynamic_analysis] copying app bundle..." << '\n';
        int copy_result = system(copy_cmd.c_str());

        if (copy_result == 0) {
            unsigned_app_bundle = fs::path(temp_dir_path) / app_name;

            // Remove original signature
            // Note: If running with sudo/admin privileges, these commands won't prompt for password
            std::string remove_sig_cmd = "codesign --remove-signature \"" +
                                        unsigned_app_bundle.string() + "/Contents/MacOS/" +
                                        target.filename().string() + "\" 2>&1";
            system(remove_sig_cmd.c_str());

            // Create empty entitlements file to remove sandbox
            std::string entitlements_path = temp_dir_path + "/empty.plist";
            std::ofstream ent_file(entitlements_path);
            ent_file << "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
            ent_file << "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n";
            ent_file << "<plist version=\"1.0\">\n<dict>\n</dict>\n</plist>\n";
            ent_file.close();

            // Re-sign with ad-hoc signature and empty entitlements (removes sandbox)
            std::string resign_cmd = "codesign -s - -f --deep --entitlements \"" +
                                    entitlements_path + "\" \"" +
                                    unsigned_app_bundle.string() + "\" 2>&1";
            std::cout << "[dynamic_analysis] applying ad-hoc signature (sandbox removed)..." << '\n';
            int resign_result = system(resign_cmd.c_str());

            if (resign_result == 0) {
                app_bundle_path = unsigned_app_bundle.string();
                need_cleanup = true;
                std::cout << "[dynamic_analysis] using unsigned copy: " << app_bundle_path << '\n';
            } else {
                std::cerr << "[dynamic_analysis] failed to re-sign, using original" << '\n';
            }
        } else {
            std::cerr << "[dynamic_analysis] failed to copy app" << '\n';
        }
    }

    // Kill any existing instances
    std::string app_name = target.filename().string();
    std::string pkill_cmd = "pkill -9 -x \"" + app_name + "\" 2>/dev/null";
    system(pkill_cmd.c_str());
    usleep(500000);

    // Launch the app
    std::string launch_cmd;
    if (!app_bundle_path.empty()) {
        launch_cmd = "open -a \"" + app_bundle_path + "\" 2>&1 &";
    } else {
        launch_cmd = "\"" + target_path + "\" > /dev/null 2>&1 &";
    }

    std::cout << "[dynamic_analysis] launching app: " << launch_cmd << '\n';
    system(launch_cmd.c_str());

    // Wait for app to start
    usleep(3000000); // 3 seconds

    // Find the PID
    std::string pgrep_cmd = "pgrep -x \"" + app_name + "\" 2>/dev/null | head -1";
    FILE* pgrep_pipe = popen(pgrep_cmd.c_str(), "r");
    pid_t target_pid = -1;

    if (pgrep_pipe) {
        char pid_buf[32];
        if (fgets(pid_buf, sizeof(pid_buf), pgrep_pipe)) {
            target_pid = std::stoi(pid_buf);
            std::cout << "[dynamic_analysis] found process PID: " << target_pid << '\n';
        }
        pclose(pgrep_pipe);
    }

    if (target_pid == -1) {
        std::cerr << "[dynamic_analysis] failed to find running process" << '\n';
        if (need_cleanup && !temp_dir_path.empty()) {
            std::string cleanup_cmd = "rm -rf \"" + temp_dir_path + "\" 2>/dev/null";
            system(cleanup_cmd.c_str());
        }
        return 1;
    }

    // Attach DTrace
    // Note: If running with sudo/admin privileges, dtrace won't prompt for password
    std::string dtrace_cmd = "dtrace -s \"" + dtrace_script.string() + "\"" +
                            " -p " + std::to_string(target_pid) +
                            " > \"" + log_file.string() + "\" 2>&1 &";

    std::cout << "[dynamic_analysis] attaching DTrace to PID " << target_pid << "..." << '\n';
    system(dtrace_cmd.c_str());

    // Monitor for 30 seconds (longer to capture more crypto operations)
    std::cout << "[dynamic_analysis] monitoring for 30 seconds..." << '\n';
    usleep(30000000);

    // Stop dtrace
    std::cout << "[dynamic_analysis] stopping DTrace..." << '\n';
    system("pkill -TERM dtrace 2>/dev/null");
    usleep(1000000);

    // Kill the app
    std::cout << "[dynamic_analysis] terminating app (PID " << target_pid << ")..." << '\n';
    kill(target_pid, SIGTERM);
    usleep(500000);
    kill(target_pid, SIGKILL);

    std::cout << "[dynamic_analysis] monitoring complete" << '\n';

    // Cleanup temporary files
    if (need_cleanup && !temp_dir_path.empty()) {
        std::string cleanup_cmd = "rm -rf \"" + temp_dir_path + "\" 2>/dev/null";
        system(cleanup_cmd.c_str());
        std::cout << "[dynamic_analysis] cleaned up temp directory" << '\n';
    }

    // Read and display log file
    std::ifstream in(log_file);
    if (!in.good()) {
        std::cout << "[dynamic_analysis] no dtrace output written (may need sudo)" << '\n';
        return 1;
    }

    std::cout << "[dynamic_analysis] captured events:" << '\n';
    std::string line;
    while (std::getline(in, line)) {
        std::cout << line << '\n';
    }

    return 0;
}

static int run_macos_dynamic_analysis(const std::filesystem::path& directory,
                                      const std::filesystem::path& binary) {
    namespace fs = std::filesystem;

    fs::path target = directory.empty() ? binary : directory / binary;
    std::error_code ec;
    target = fs::weakly_canonical(target, ec);
    if (ec) target = fs::absolute(target);

    if (!fs::exists(target)) {
        std::cerr << "[dynamic_analysis] target not found: " << target << '\n';
        return 1;
    }
    if (!is_executable(target)) {
        std::cerr << "[dynamic_analysis] target is not executable: " << target << '\n';
        return 1;
    }

    fs::path log_file;
    if (const char* existing = std::getenv("HOOK_NDJSON"); existing && *existing) {
        log_file = existing;
    } else {
        log_file = default_log_path(binary.filename());
    }
    if (!log_file.parent_path().empty()) {
        fs::create_directories(log_file.parent_path());
    }
    std::error_code remove_ec;
    fs::remove(log_file, remove_ec);

    // Check if target is SIP-protected (in /Applications, /System, /usr)
    bool is_sip_protected = false;
    std::string target_str = target.string();
    if (target_str.find("/Applications/") != std::string::npos ||
        target_str.find("/System/") != std::string::npos ||
        target_str.find("/usr/bin/") != std::string::npos ||
        target_str.find("/usr/sbin/") != std::string::npos) {
        is_sip_protected = true;
    }

    // For SIP-protected binaries or when USE_DTRACE is set, use DTrace
    if (is_sip_protected || std::getenv("USE_DTRACE")) {
        std::cout << "[dynamic_analysis] using DTrace for analysis (requires sudo)" << '\n';
        return run_macos_dtrace_analysis(target, log_file);
    }

    // Original DYLD_INSERT_LIBRARIES method for non-SIP binaries
    fs::path hook = locate_hook_library();
    if (hook.empty() || !fs::exists(hook)) {
        std::cerr << "[dynamic_analysis] unable to locate libhook.dylib, falling back to DTrace" << '\n';
        return run_macos_dtrace_analysis(target, log_file);
    }

    auto capture_env = [](const char* key) {
        const char* value = std::getenv(key);
        return value ? std::optional<std::string>(value) : std::nullopt;
    };
    auto restore_env = [](const char* key, const std::optional<std::string>& value) {
        if (value.has_value()) {
            setenv(key, value->c_str(), 1);
        } else {
            unsetenv(key);
        }
    };

    std::optional<std::string> prev_dyld_insert = capture_env("DYLD_INSERT_LIBRARIES");
    std::optional<std::string> prev_hook_verbose = capture_env(HOOK_ENV_VERBOSE);
    std::optional<std::string> prev_hook_ndjson = capture_env("HOOK_NDJSON");

    setenv("DYLD_INSERT_LIBRARIES", hook.c_str(), 1);
    setenv(HOOK_ENV_VERBOSE, "1", 1);
    setenv("HOOK_NDJSON", log_file.c_str(), 1);

    std::cout << "[dynamic_analysis] host: macOS (DYLD_INSERT_LIBRARIES)" << '\n';
    std::cout << "[dynamic_analysis] preload: " << hook << '\n';
    std::cout << "[dynamic_analysis] target:  " << target << '\n';
    std::cout << "[dynamic_analysis] log:     " << log_file << '\n';

    pid_t pid = fork();
    if (pid == 0) {
        execl(target.c_str(), target.c_str(), static_cast<char*>(nullptr));
        perror("execl");
        _exit(errno ? errno : 1);
    }
    if (pid < 0) {
        perror("fork");
        restore_env("DYLD_INSERT_LIBRARIES", prev_dyld_insert);
        restore_env(HOOK_ENV_VERBOSE, prev_hook_verbose);
        restore_env("HOOK_NDJSON", prev_hook_ndjson);
        return 1;
    }

    int status = 0;
    if (waitpid(pid, &status, 0) < 0) {
        perror("waitpid");
        restore_env("DYLD_INSERT_LIBRARIES", prev_dyld_insert);
        restore_env(HOOK_ENV_VERBOSE, prev_hook_verbose);
        restore_env("HOOK_NDJSON", prev_hook_ndjson);
        return 1;
    }

    restore_env("DYLD_INSERT_LIBRARIES", prev_dyld_insert);
    restore_env(HOOK_ENV_VERBOSE, prev_hook_verbose);
    restore_env("HOOK_NDJSON", prev_hook_ndjson);

    if (WIFEXITED(status)) {
        std::cout << "[dynamic_analysis] child exit code: " << WEXITSTATUS(status) << '\n';
    } else if (WIFSIGNALED(status)) {
        std::cout << "[dynamic_analysis] child terminated by signal: " << WTERMSIG(status) << '\n';
    }

    std::ifstream in(log_file);
    if (!in.good()) {
        std::cout << "[dynamic_analysis] no hook output written." << '\n';
        return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
    }

    std::cout << "[dynamic_analysis] captured events:" << '\n';
    std::string line;
    while (std::getline(in, line)) {
        std::cout << line << '\n';
    }
    return WIFEXITED(status) ? WEXITSTATUS(status) : 0;
}
#endif

#if defined(_WIN32) || defined(_WIN64)
static std::filesystem::path locate_hook_dll() {
    namespace fs = std::filesystem;
    std::vector<fs::path> candidates;

    // Check environment variable first
    if (const char* env = std::getenv("HOOK_LIBRARY_PATH")) {
        if (*env) candidates.emplace_back(env);
    }

    // Add standard search paths
    std::error_code ec;
    char module_path[MAX_PATH];
    if (GetModuleFileName(nullptr, module_path, MAX_PATH) != 0) {
        fs::path exe_path = fs::absolute(fs::path(module_path), ec);
        fs::path bin_dir = exe_path.parent_path();
        if (!bin_dir.empty()) {
            // Try bin directory first (for Release/Debug builds)
            candidates.emplace_back(bin_dir / "hook.dll");
            fs::path build_dir = bin_dir.parent_path();
            if (!build_dir.empty()) {
                candidates.emplace_back(build_dir / "lib" / "hook.dll");
                candidates.emplace_back(build_dir / "hook.dll");
            }
        }
    }

    // Skip current_path() based search when running with elevated privileges
    // to avoid permission issues

    for (const auto& candidate : candidates) {
        if (candidate.empty()) continue;
        std::error_code exists_ec;
        if (std::filesystem::exists(candidate, exists_ec) && !exists_ec) {
            std::error_code canon_ec;
            auto canonical_path = std::filesystem::canonical(candidate, canon_ec);
            return canon_ec ? std::filesystem::absolute(candidate) : canonical_path;
        }
    }
    return {};
}

static int run_windows_dynamic_analysis(const std::filesystem::path& directory,
                                       const std::filesystem::path& binary) {
    namespace fs = std::filesystem;

    fs::path target = directory.empty() ? binary : directory / binary;
    std::error_code ec;
    target = fs::weakly_canonical(target, ec);
    if (ec) target = fs::absolute(target);

    if (!fs::exists(target)) {
        std::cerr << "[dynamic_analysis] target not found: " << target << '\n';
        return 1;
    }

    fs::path hook_dll = locate_hook_dll();
    if (hook_dll.empty() || !fs::exists(hook_dll)) {
        std::cerr << "[dynamic_analysis] unable to locate hook.dll" << '\n';
        return 1;
    }

    fs::path log_file;
    std::string existing_log;
    {
        DWORD needed = GetEnvironmentVariableA("HOOK_NDJSON", nullptr, 0);
        if (needed > 0) {
            existing_log.resize(needed - 1);
            GetEnvironmentVariableA("HOOK_NDJSON", existing_log.data(), needed);
        }
    }
    if (!existing_log.empty()) {
        log_file = fs::path(existing_log);
    } else {
        log_file = default_log_path(binary.filename());
    }
    if (!log_file.parent_path().empty()) {
        std::error_code mk_ec;
        fs::create_directories(log_file.parent_path(), mk_ec);
    }
    std::error_code remove_ec;
    fs::remove(log_file, remove_ec);

    // Set environment variables
    std::string log_path = log_file.string();
    SetEnvironmentVariable("HOOK_NDJSON", log_path.c_str());
    SetEnvironmentVariable("HOOK_VERBOSE", "1");

    // Create process with DLL injection using Detours
    STARTUPINFO si = { sizeof(si) };
    PROCESS_INFORMATION pi = { 0 };

    std::string cmd_line = "\"" + target.string() + "\"";
    std::vector<char> cmd_buffer(cmd_line.begin(), cmd_line.end());
    cmd_buffer.push_back('\0');

    std::string target_str = target.string();
    std::string hook_dll_str = hook_dll.string();

    // Set working directory to target's directory so it can find DLLs
    fs::path target_dir = target.parent_path();
    std::string target_dir_str = target_dir.string();

    // Verbose logging
    if (std::getenv("HOOK_VERBOSE")) {
        std::cout << "[dynamic_analysis] Target executable: " << target_str << '\n';
        std::cout << "[dynamic_analysis] Hook DLL: " << hook_dll_str << '\n';
        std::cout << "[dynamic_analysis] Working directory: " << target_dir_str << '\n';
        std::cout << "[dynamic_analysis] Log file: " << log_path << '\n';

        // Verify files exist
        if (!fs::exists(target)) {
            std::cerr << "[dynamic_analysis] ERROR: Target executable does not exist!\n";
        }
        if (!fs::exists(hook_dll)) {
            std::cerr << "[dynamic_analysis] ERROR: Hook DLL does not exist!\n";
        }
    }

    // Set working directory to target's directory so it can find DLLs
    // Use nullptr for environment to inherit parent's environment
    // The hook.dll and its dependencies must be accessible via system PATH or in target directory

    BOOL success = DetourCreateProcessWithDllA(
        nullptr,                           // Application name (nullptr = use command line)
        cmd_buffer.data(),                 // Command line
        nullptr,                           // Process security attributes
        nullptr,                           // Thread security attributes
        FALSE,                             // Inherit handles
        0,                                 // Creation flags
        nullptr,                           // Environment (inherit from parent)
        nullptr,                           // Current directory (inherit from parent)
        &si,                               // Startup info
        &pi,                               // Process info
        hook_dll_str.c_str(),              // DLL to inject
        nullptr);                          // Additional DLLs

    if (!success) {
        DWORD error = GetLastError();
        std::cerr << "[dynamic_analysis] DetourCreateProcessWithDll failed with error: " << error << '\n';

        // Provide more detailed error messages
        switch (error) {
            case 2:
                std::cerr << "[dynamic_analysis] ERROR_FILE_NOT_FOUND (2): Target executable or hook DLL not found\n";
                break;
            case 3:
                std::cerr << "[dynamic_analysis] ERROR_PATH_NOT_FOUND (3): Path to target or hook DLL invalid\n";
                break;
            case 193:
                std::cerr << "[dynamic_analysis] ERROR_BAD_EXE_FORMAT (193): Not a valid Win32 application\n";
                break;
            case 998:
                std::cerr << "[dynamic_analysis] ERROR_NOACCESS (998): Invalid access to memory location\n";
                break;
            default:
                std::cerr << "[dynamic_analysis] See https://docs.microsoft.com/en-us/windows/win32/debug/system-error-codes for error code details\n";
                break;
        }
        return 1;
    }

    if (std::getenv("HOOK_VERBOSE")) {
        std::cout << "[dynamic_analysis] Process created successfully, PID: " << pi.dwProcessId << '\n';
    }

    // Wait for process completion
    WaitForSingleObject(pi.hProcess, INFINITE);

    DWORD exit_code;
    GetExitCodeProcess(pi.hProcess, &exit_code);
    std::cout << "[dynamic_analysis] child exit code: " << exit_code << '\n';

    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

    // Read and display log file
    std::ifstream in(log_file);
    if (!in.good()) {
        std::cout << "[dynamic_analysis] no hook output written." << '\n';
        return exit_code;
    }

    std::cout << "[dynamic_analysis] captured events:" << '\n';
    std::string line;
    while (std::getline(in, line)) {
        std::cout << line << '\n';
    }

    return exit_code;
}
#endif

} // namespace

int dynamic_analysis(const std::string& directory, const std::string& binary_name) {
    HostOS os = detect_host_os();
    switch (os) {
        case HostOS::Linux:
#if defined(__linux__)
            return run_linux_dynamic_analysis(directory, binary_name);
#else
            std::cerr << "[dynamic_analysis] built without Linux support." << '\n';
            return 1;
#endif
        case HostOS::Windows:
#if defined(_WIN32) || defined(_WIN64)
            return run_windows_dynamic_analysis(directory, binary_name);
#else
            std::cerr << "[dynamic_analysis] built without Windows support." << '\n';
            return 1;
#endif
        case HostOS::MacOS:
#if defined(__APPLE__) && defined(__MACH__)
            return run_macos_dynamic_analysis(directory, binary_name);
#else
            std::cerr << "[dynamic_analysis] built without macOS support." << '\n';
            return 1;
#endif
        default:
            std::cout << "[dynamic_analysis] unsupported host platform." << '\n';
            return 1;
    }
}
