#include "common/pch.h"
#include "common/dynamic_analysis.h"
#include "common/hook_common.h"

#include <filesystem>
#include <fstream>
#include <iostream>
#include <algorithm>
#include <optional>
#include <string>
#include <system_error>
#include <vector>

#include <cerrno>
#include <cstdlib>
#include <chrono>
#include <thread>
#include <ctime>
#include <sstream>
#include <cctype>
#include <unordered_set>
#include <cwctype>

#if defined(__linux__)
  #include <sys/stat.h>
  #include <sys/types.h>
  #include <sys/wait.h>
  #include <unistd.h>
#elif defined(_WIN32) || defined(_WIN64)
  #include <windows.h>
  #include <detours.h>
  #include <tlhelp32.h>
#elif defined(__APPLE__) && defined(__MACH__)
  #include <mach-o/dyld.h>
  #include <sys/stat.h>
  #include <sys/types.h>
  #include <sys/wait.h>
  #include <signal.h>
  #include <unistd.h>
#endif

namespace {

#if defined(_WIN32) || defined(_WIN64)
static std::wstring to_lower_wstring(std::wstring value);
static std::unordered_set<DWORD> collect_matching_processes(const std::wstring& normalized_target_path,
                                                            const std::wstring& target_filename_lower);
static void terminate_new_matching_processes(const std::wstring& normalized_target_path,
                                             const std::wstring& target_filename_lower,
                                             const std::unordered_set<DWORD>& baseline,
                                             DWORD exclude_pid);
#endif

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

#if defined(_WIN32) || defined(_WIN64)
    fs::path logs_dir = fs::temp_directory_path(ec) / "crypto_scanner_logs";
#else
    // Use /tmp instead of current_path() to avoid permission issues when running with sudo
    fs::path logs_dir = fs::path("/tmp") / "crypto_scanner_logs";
#endif
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
static int read_monitor_seconds() {
    constexpr int kDefaultSeconds = 30;
    constexpr int kMaxSeconds = 600;

    if (const char* env = std::getenv("HOOK_MONITOR_SECONDS"); env && *env) {
        char* end = nullptr;
        long parsed = std::strtol(env, &end, 10);
        if (end && *end == '\0' && parsed > 0) {
            if (parsed > kMaxSeconds) {
                parsed = kMaxSeconds;
            }
            return static_cast<int>(parsed);
        }
    }
    return kDefaultSeconds;
}

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

// Linux strace-based dynamic analysis (requires sudo)
static int run_linux_strace_analysis(const std::filesystem::path& target,
                                     const std::filesystem::path& log_file) {
    namespace fs = std::filesystem;

    std::cout << "[dynamic_analysis] using strace for analysis (requires sudo)" << '\n';

    // Start the target process in the background
    std::string launch_cmd = "\"" + target.string() + "\" &";
    std::cout << "[dynamic_analysis] launching: " + launch_cmd << '\n';
    int launch_ret = system(launch_cmd.c_str());
    if (launch_ret != 0) {
        std::cerr << "[dynamic_analysis] failed to launch target" << '\n';
        return 1;
    }

    // Wait for process to start
    usleep(3000000); // 3 seconds

    // Find the PID of the target process
    std::string target_name = target.filename().string();
    std::string pgrep_cmd = "pgrep -x \"" + target_name + "\" 2>/dev/null | head -1";

    FILE* pgrep_pipe = popen(pgrep_cmd.c_str(), "r");
    if (!pgrep_pipe) {
        std::cerr << "[dynamic_analysis] failed to run pgrep" << '\n';
        return 1;
    }

    char pid_buf[64] = {0};
    if (!fgets(pid_buf, sizeof(pid_buf), pgrep_pipe)) {
        pclose(pgrep_pipe);
        std::cerr << "[dynamic_analysis] target process not found" << '\n';
        return 1;
    }
    pclose(pgrep_pipe);

    pid_t target_pid = static_cast<pid_t>(std::atoi(pid_buf));
    if (target_pid <= 0) {
        std::cerr << "[dynamic_analysis] invalid PID: " << pid_buf << '\n';
        return 1;
    }

    std::cout << "[dynamic_analysis] found target PID: " << target_pid << '\n';

    // Run strace to monitor crypto library calls
    // Focus on commonly used crypto libraries
    std::string strace_output = log_file.string() + ".strace";
    std::string strace_cmd = "strace -f -e trace=openat,read,write -p " +
                            std::to_string(target_pid) +
                            " -o \"" + strace_output + "\" 2>&1 &";

    std::cout << "[dynamic_analysis] starting strace on PID " << target_pid << '\n';
    system(strace_cmd.c_str());

    const int monitor_seconds = read_monitor_seconds();
    std::cout << "[dynamic_analysis] monitoring for " << monitor_seconds << " seconds..." << '\n';
    std::this_thread::sleep_for(std::chrono::seconds(monitor_seconds));

    // Stop strace
    system("pkill -TERM strace 2>/dev/null");
    usleep(1000000); // 1 second

    // Stop target process
    std::cout << "[dynamic_analysis] stopping target process..." << '\n';
    kill(target_pid, SIGTERM);
    usleep(2000000); // 2 seconds
    kill(target_pid, SIGKILL);

    // Parse strace output and create NDJSON log
    std::cout << "[dynamic_analysis] parsing strace output..." << '\n';

    std::ifstream strace_in(strace_output);
    std::ofstream ndjson_out(log_file);

    if (strace_in.good() && ndjson_out.good()) {
        std::string line;
        int event_count = 0;

        while (std::getline(strace_in, line)) {
            // Look for crypto library loading
            if (line.find("libcrypto") != std::string::npos ||
                line.find("libssl") != std::string::npos ||
                line.find("libgcrypt") != std::string::npos ||
                line.find("libsodium") != std::string::npos ||
                line.find("libmbedcrypto") != std::string::npos ||
                line.find("libgnutls") != std::string::npos ||
                line.find("libnss") != std::string::npos) {

                // Create a basic detection event
                ndjson_out << "{\"event\":\"crypto_library_detected\",\"detail\":\""
                          << line << "\",\"timestamp\":" << event_count++ << "}\n";
            }
        }

        std::cout << "[dynamic_analysis] found " << event_count << " crypto-related events" << '\n';
    }

    strace_in.close();
    ndjson_out.close();

    // Clean up strace output
    std::error_code remove_ec;
    fs::remove(strace_output, remove_ec);

    return 0;
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

    // For sandboxed processes (e.g., Firefox), write hook output to /tmp and copy later.
    fs::path hook_log_file = log_file;
    bool use_temp_hook_log = false;
    if (std::getenv("USE_STRACE") != nullptr) {
        fs::path tmp_log = default_log_path(binary.filename());
        if (!tmp_log.empty()) {
            hook_log_file = tmp_log;
            use_temp_hook_log = true;
            if (!hook_log_file.parent_path().empty()) {
                fs::create_directories(hook_log_file.parent_path());
            }
            fs::remove(hook_log_file, remove_ec);
        }
    }

    // Get hook library path
    fs::path hook = locate_hook_library();
    if (hook.empty() || !fs::exists(hook)) {
        std::cerr << "[dynamic_analysis] unable to locate libhook.so" << '\n';
        return 1;
    }

    // Check if enhanced monitoring should be used (admin mode)
    bool enhanced_mode = (std::getenv("USE_STRACE") != nullptr);
    if (enhanced_mode) {
        std::cout << "[dynamic_analysis] Enhanced monitoring mode enabled (admin mode)" << '\n';
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

    std::optional<std::string> prev_ld_preload = capture_env("LD_PRELOAD");
    std::optional<std::string> prev_hook_verbose = capture_env(HOOK_ENV_VERBOSE);
    std::optional<std::string> prev_hook_ndjson = capture_env("HOOK_NDJSON");

    setenv("LD_PRELOAD", hook.c_str(), 1);
    setenv(HOOK_ENV_VERBOSE, "1", 1);
    setenv("HOOK_NDJSON", hook_log_file.c_str(), 1);

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

    // Declare status before if/else so it's available for return statements
    int status = 0;

    // If enhanced mode, monitor for a fixed duration then terminate
    if (enhanced_mode) {
        const int monitor_seconds = read_monitor_seconds();
        std::cout << "[dynamic_analysis] Monitoring for " << monitor_seconds << " seconds..." << '\n';
        std::this_thread::sleep_for(std::chrono::seconds(monitor_seconds));

        std::cout << "[dynamic_analysis] Terminating target process..." << '\n';
        kill(pid, SIGTERM);
        std::this_thread::sleep_for(std::chrono::seconds(2));
        kill(pid, SIGKILL); // Force kill if still running

        waitpid(pid, &status, 0); // Clean up zombie process
    } else {
        // Normal mode: wait for process to exit
        if (waitpid(pid, &status, 0) < 0) {
            perror("waitpid");
            restore_env("LD_PRELOAD", prev_ld_preload);
            restore_env(HOOK_ENV_VERBOSE, prev_hook_verbose);
            restore_env("HOOK_NDJSON", prev_hook_ndjson);
            return 1;
        }

        if (WIFEXITED(status)) {
            std::cout << "[dynamic_analysis] child exit code: " << WEXITSTATUS(status) << '\n';
        } else if (WIFSIGNALED(status)) {
            std::cout << "[dynamic_analysis] child terminated by signal: " << WTERMSIG(status) << '\n';
        }
    }

    restore_env("LD_PRELOAD", prev_ld_preload);
    restore_env(HOOK_ENV_VERBOSE, prev_hook_verbose);
    restore_env("HOOK_NDJSON", prev_hook_ndjson);

    fs::path final_log = log_file;
    if (use_temp_hook_log) {
        std::error_code copy_ec;
        if (fs::exists(hook_log_file)) {
            fs::copy_file(hook_log_file, log_file,
                          fs::copy_options::overwrite_existing, copy_ec);
            if (!copy_ec) {
                final_log = log_file;
            } else {
                final_log = hook_log_file;
            }
        } else {
            final_log = hook_log_file;
        }
    }

    std::ifstream in(final_log);
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

static DWORD read_windows_monitor_timeout_ms() {
    constexpr DWORD kDefaultSeconds = 45;
    constexpr DWORD kMaxSeconds = 600;
    DWORD seconds = kDefaultSeconds;

    if (const char* env = std::getenv("HOOK_MONITOR_SECONDS"); env && *env) {
        char* end = nullptr;
        long parsed = std::strtol(env, &end, 10);
        if (end && *end == '\0' && parsed >= 0) {
            if (parsed > static_cast<long>(kMaxSeconds)) {
                parsed = kMaxSeconds;
            }
            seconds = static_cast<DWORD>(parsed);
        }
    }

    if (seconds == 0) {
        return 0;
    }
    return seconds * 1000;
}

static bool is_chromium_browser_exe(const std::filesystem::path& target) {
    static const std::unordered_set<std::string> chromium_names = {
        "chrome.exe",
        "chromium.exe",
        "msedge.exe",
        "brave.exe",
        "vivaldi.exe",
        "opera.exe",
        "opera_browser.exe",
        "operagx.exe"
    };

    std::string name = target.filename().string();
    std::transform(name.begin(), name.end(), name.begin(),
                   [](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });
    return chromium_names.find(name) != chromium_names.end();
}

static std::string quote_argument(const std::string& arg) {
    if (arg.empty()) {
        return "\"\"";
    }
    bool needs_quotes = false;
    for (char ch : arg) {
        if (std::isspace(static_cast<unsigned char>(ch)) || ch == '"') {
            needs_quotes = true;
            break;
        }
    }
    if (!needs_quotes) {
        return arg;
    }

    std::string result;
    result.reserve(arg.size() + 2);
    result.push_back('"');

    size_t backslash_count = 0;
    for (char ch : arg) {
        if (ch == '\\') {
            ++backslash_count;
            continue;
        }
        if (ch == '"') {
            result.append(backslash_count * 2 + 1, '\\');
            result.push_back('"');
            backslash_count = 0;
            continue;
        }
        if (backslash_count) {
            result.append(backslash_count, '\\');
            backslash_count = 0;
        }
        result.push_back(ch);
    }
    if (backslash_count) {
        result.append(backslash_count * 2, '\\');
    }
    result.push_back('"');
    return result;
}

static std::optional<std::string> get_env_var(const char* key) {
    DWORD needed = GetEnvironmentVariableA(key, nullptr, 0);
    if (needed == 0) {
        return std::nullopt;
    }
    std::string value;
    value.resize(static_cast<size_t>(needed - 1));
    if (GetEnvironmentVariableA(key, value.data(), needed) == 0) {
        return std::nullopt;
    }
    return value;
}

static void restore_env_var(const char* key, const std::optional<std::string>& value) {
    if (value.has_value()) {
        SetEnvironmentVariableA(key, value->c_str());
    } else {
        SetEnvironmentVariableA(key, nullptr);
    }
}

static std::filesystem::path create_temp_profile_dir(const std::string& prefix) {
    namespace fs = std::filesystem;
    std::error_code ec;
    fs::path base = fs::temp_directory_path(ec);
    if (ec) return {};

    fs::path root = base / "CryptoScanner" / "profiles";
    fs::create_directories(root, ec);
    if (ec) return {};

    auto now = std::chrono::system_clock::now().time_since_epoch().count();
    std::stringstream ss;
    ss << prefix << "_" << std::hex << now;

    fs::path candidate = root / ss.str();
    fs::create_directories(candidate, ec);
    if (ec) return {};
    return candidate;
}

static void terminate_process_tree(DWORD root_pid) {
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) {
        HANDLE process = OpenProcess(PROCESS_TERMINATE, FALSE, root_pid);
        if (process) {
            TerminateProcess(process, 0);
            CloseHandle(process);
        }
        return;
    }

    std::vector<PROCESSENTRY32> processes;
    PROCESSENTRY32 entry{};
    entry.dwSize = sizeof(entry);
    if (Process32First(snapshot, &entry)) {
        do {
            processes.push_back(entry);
        } while (Process32Next(snapshot, &entry));
    }
    CloseHandle(snapshot);

    std::vector<DWORD> stack{root_pid};
    std::unordered_set<DWORD> visited;

    while (!stack.empty()) {
        DWORD pid = stack.back();
        stack.pop_back();
        if (!visited.insert(pid).second) {
            continue;
        }
        for (const auto& proc : processes) {
            if (proc.th32ParentProcessID == pid) {
                stack.push_back(proc.th32ProcessID);
            }
        }
        HANDLE process = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
        if (process) {
            TerminateProcess(process, 0);
            CloseHandle(process);
        }
    }
}

static void append_tls_events_from_keylog(const std::filesystem::path& key_log_path,
                                          const std::filesystem::path& ndjson_path) {
    namespace fs = std::filesystem;
    if (!fs::exists(key_log_path)) return;

    std::ifstream key_in(key_log_path);
    if (!key_in.good()) return;

    std::ofstream out(ndjson_path, std::ios::app);
    if (!out.good()) return;

    std::string line;
    while (std::getline(key_in, line)) {
        if (line.empty()) continue;
        std::istringstream iss(line);
        std::string label, client_random, secret;
        if (!(iss >> label >> client_random >> secret)) continue;
        if (secret.empty()) continue;

        int keylen = static_cast<int>(secret.size() / 2);
        out << "{\"surface\":\"tls\",\"api\":\"SSLKEYLOG\",\"dir\":\"enc\",\"cipher\":\"TLS\","
               "\"client_random\":\""
            << client_random << "\",\"key\":\"" << secret << "\",\"keylen\":" << keylen << "}\n";
    }
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

    std::string hook_dll_str = hook_dll.string();
    std::string log_path = log_file.string();

    std::string target_str = target.string();
    bool is_chromium = is_chromium_browser_exe(target);
    std::wstring normalized_target_path = to_lower_wstring(target.wstring());
    std::wstring target_filename_lower = to_lower_wstring(target.filename().wstring());
    auto baseline_matching_pids = collect_matching_processes(normalized_target_path, target_filename_lower);

    // Create process with DLL injection using Detours
    STARTUPINFOA si = { sizeof(si) };
    PROCESS_INFORMATION pi = { 0 };

    auto prev_hook_ndjson = get_env_var("HOOK_NDJSON");
    auto prev_hook_verbose = get_env_var("HOOK_VERBOSE");
    auto prev_hook_library = get_env_var("HOOK_LIBRARY_PATH");
    auto prev_ssl_keylog = get_env_var("SSLKEYLOGFILE");

    auto restore_envs = [&]() {
        restore_env_var("HOOK_NDJSON", prev_hook_ndjson);
        restore_env_var("HOOK_VERBOSE", prev_hook_verbose);
        restore_env_var("HOOK_LIBRARY_PATH", prev_hook_library);
        restore_env_var("SSLKEYLOGFILE", prev_ssl_keylog);
    };

    fs::path key_log_path = log_file;
    key_log_path += ".keylog";
    std::error_code remove_key_ec;
    fs::remove(key_log_path, remove_key_ec);

    SetEnvironmentVariableA("HOOK_NDJSON", log_path.c_str());
    SetEnvironmentVariableA("HOOK_LIBRARY_PATH", hook_dll_str.c_str());
    const char* verbose_value = prev_hook_verbose ? prev_hook_verbose->c_str() : "0";
    SetEnvironmentVariableA("HOOK_VERBOSE", verbose_value);
    SetEnvironmentVariableA("SSLKEYLOGFILE", key_log_path.string().c_str());

    std::string cmd_line = quote_argument(target_str);
    fs::path user_data_dir;

    if (is_chromium) {
        user_data_dir = create_temp_profile_dir("chromium_profile");
        if (!user_data_dir.empty()) {
            cmd_line += " --user-data-dir=" + quote_argument(user_data_dir.string());
        }
        cmd_line += " --ssl-key-log-file=" + quote_argument(key_log_path.string());
        cmd_line += " --no-first-run --no-default-browser-check --disable-features=TranslateUI";
    }

    std::vector<char> cmd_buffer(cmd_line.begin(), cmd_line.end());
    cmd_buffer.push_back('\0');

    // Set working directory to target's directory so it can find DLLs
    fs::path target_dir = target.parent_path();
    std::string target_dir_str = target_dir.string();

    // Verbose logging
    if (std::getenv("HOOK_VERBOSE")) {
        std::cout << "[dynamic_analysis] Target executable: " << target_str << '\n';
        std::cout << "[dynamic_analysis] Hook DLL: " << hook_dll_str << '\n';
        std::cout << "[dynamic_analysis] Working directory: " << target_dir_str << '\n';
        std::cout << "[dynamic_analysis] Log file: " << log_path << '\n';
        std::cout << "[dynamic_analysis] Key log: " << key_log_path.string() << '\n';

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

    const char* current_dir_cstr = target_dir_str.empty() ? nullptr : target_dir_str.c_str();

    BOOL success = DetourCreateProcessWithDllA(
        nullptr,                           // Application name (nullptr = use command line)
        cmd_buffer.data(),                 // Command line
        nullptr,                           // Process security attributes
        nullptr,                           // Thread security attributes
        FALSE,                             // Inherit handles
        0,                                 // Creation flags
        nullptr,                           // Environment (inherit from parent)
        current_dir_cstr,                  // Current directory (use target directory when available)
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
        restore_envs();
        return 1;
    }

    if (std::getenv("HOOK_VERBOSE")) {
        std::cout << "[dynamic_analysis] Process created successfully, PID: " << pi.dwProcessId << '\n';
    }

    HANDLE job = CreateJobObjectA(nullptr, nullptr);
    if (job) {
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION info{};
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &info, sizeof(info)) ||
            !AssignProcessToJobObject(job, pi.hProcess)) {
            CloseHandle(job);
            job = nullptr;
        }
    }

    DWORD monitor_timeout_ms = read_windows_monitor_timeout_ms();

    auto terminate_children = [&]() {
        if (job) {
            TerminateJobObject(job, 0);
        } else {
            terminate_process_tree(pi.dwProcessId);
        }
    };

    DWORD wait_result = WaitForSingleObject(pi.hProcess, monitor_timeout_ms ? monitor_timeout_ms : INFINITE);
    if (wait_result == WAIT_TIMEOUT) {
        std::cout << "[dynamic_analysis] monitor timeout reached (" << monitor_timeout_ms / 1000
                  << "s), terminating target" << '\n';
        terminate_children();
        TerminateProcess(pi.hProcess, 0);
        WaitForSingleObject(pi.hProcess, 5000);
    } else if (wait_result == WAIT_OBJECT_0 && monitor_timeout_ms) {
        std::cout << "[dynamic_analysis] primary process exited; waiting " << monitor_timeout_ms / 1000
                  << "s for child activity" << '\n';
        Sleep(monitor_timeout_ms);
        terminate_children();
    } else if (wait_result == WAIT_FAILED) {
        DWORD err = GetLastError();
        std::cerr << "[dynamic_analysis] WaitForSingleObject failed (error=" << err << ")\n";
    }

    if (job) {
        CloseHandle(job); // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE ensures remaining children terminate
        job = nullptr;
    }

    terminate_new_matching_processes(
        normalized_target_path, target_filename_lower, baseline_matching_pids, pi.dwProcessId);

    DWORD exit_code;
    GetExitCodeProcess(pi.hProcess, &exit_code);
    std::cout << "[dynamic_analysis] child exit code: " << exit_code << '\n';

    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

    restore_envs();

    append_tls_events_from_keylog(key_log_path, log_file);

    std::error_code cleanup_ec;
    if (!user_data_dir.empty()) {
        fs::remove_all(user_data_dir, cleanup_ec);
    }
    fs::remove(key_log_path, cleanup_ec);

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

#if defined(_WIN32) || defined(_WIN64)
namespace {

static std::wstring to_lower_wstring(std::wstring value) {
    std::transform(value.begin(), value.end(), value.begin(), [](wchar_t ch) {
        return static_cast<wchar_t>(std::towlower(ch));
    });
    return value;
}

static std::unordered_set<DWORD> collect_matching_processes(const std::wstring& normalized_target_path,
                                                            const std::wstring& target_filename_lower) {
    std::unordered_set<DWORD> matches;
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) {
        return matches;
    }

    PROCESSENTRY32W entry{};
    entry.dwSize = sizeof(entry);
    if (!Process32FirstW(snapshot, &entry)) {
        CloseHandle(snapshot);
        return matches;
    }

    do {
        if (entry.th32ProcessID == 0) continue;

        std::wstring exe_lower = to_lower_wstring(std::wstring(entry.szExeFile));
        if (!target_filename_lower.empty() && exe_lower != target_filename_lower) {
            continue;
        }

        bool inserted = false;
        if (!normalized_target_path.empty()) {
            HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, entry.th32ProcessID);
            if (process) {
                std::vector<wchar_t> buffer(32768, L'\0');
                DWORD len = static_cast<DWORD>(buffer.size());
                if (QueryFullProcessImageNameW(process, 0, buffer.data(), &len) && len > 0) {
                    std::wstring image_path(buffer.data(), len);
                    std::wstring image_lower = to_lower_wstring(image_path);
                    if (image_lower == normalized_target_path) {
                        matches.insert(entry.th32ProcessID);
                        inserted = true;
                        CloseHandle(process);
                        continue;
                    }
                }
                CloseHandle(process);
            }
        }

        if (!inserted) {
            matches.insert(entry.th32ProcessID);
        }
    } while (Process32NextW(snapshot, &entry));

    CloseHandle(snapshot);
    return matches;
}

static void terminate_new_matching_processes(const std::wstring& normalized_target_path,
                                             const std::wstring& target_filename_lower,
                                             const std::unordered_set<DWORD>& baseline,
                                             DWORD exclude_pid) {
    auto current = collect_matching_processes(normalized_target_path, target_filename_lower);
    for (DWORD pid : current) {
        if (pid == exclude_pid || baseline.count(pid)) {
            continue;
        }

        HANDLE process = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
        if (!process) {
            continue;
        }
        if (TerminateProcess(process, 0)) {
            std::cerr << "[dynamic_analysis] terminated lingering process PID " << pid << '\n';
        }
        CloseHandle(process);
    }
}

} // namespace
#endif

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
