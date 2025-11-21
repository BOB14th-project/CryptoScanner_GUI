#include "CryptoScanner.h"

#include <iostream>
#include <filesystem>
#include <iomanip>
#include <set>
#include <atomic>
#include <chrono>

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#endif

namespace fs = std::filesystem;

// Global flag for cancellation
static std::atomic<bool> g_cancelled{false};

// Signal handler for Ctrl+C (for testing)
#ifdef _WIN32
BOOL WINAPI ConsoleHandler(DWORD signal) {
    if (signal == CTRL_C_EVENT) {
        g_cancelled.store(true);
        return TRUE;
    }
    return FALSE;
}
#else
#include <signal.h>
void signalHandler(int signum) {
    g_cancelled.store(true);
}
#endif

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <path|--full-scan>" << std::endl;
        return 1;
    }

    // Setup signal handlers
#ifdef _WIN32
    SetConsoleCtrlHandler(ConsoleHandler, TRUE);
#else
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
#endif

    std::string targetPath = argv[1];
    bool isFullScan = (targetPath == "--full-scan");

    CryptoScanner scanner;

    // Determine scan root paths
    std::vector<std::string> scanRoots;
    if (isFullScan) {
#ifdef _WIN32
        // Windows: Start from C:\ root
        scanRoots.push_back("C:\\");
#elif defined(__APPLE__)
        // macOS: Start from root (/)
        scanRoots.push_back("/");
#else
        // Linux: Start from root (/)
        scanRoots.push_back("/");
#endif
        targetPath = "FULL_SYSTEM_SCAN";
        std::cout << "FULLSCAN:START" << std::endl;
    } else {
        // Normal scan: check if path exists
        if (!fs::exists(targetPath)) {
            std::cerr << "Error: Path does not exist: " << targetPath << std::endl;
            return 1;
        }
        scanRoots.push_back(targetPath);
    }

    try {
        std::vector<Detection> results;
        std::set<std::string> uniqueFiles;
        auto startTime = std::chrono::steady_clock::now();

        if (isFullScan) {
            // Full system scan using antivirus-like mode
            ScanOptions opts;
            opts.recurse = true;
            opts.deepJar = true;
            opts.profile = ScanProfile::InstitutionStrict;

            // Minimal glob exclusions (most are handled by shouldSkipByProfile in CryptoScanner.cpp)
            opts.excludeGlobs.clear();

#ifdef _WIN32
            // Windows-specific glob exclusions
            opts.excludeGlobs.push_back("C:\\Windows\\*");
            opts.excludeGlobs.push_back("C:\\ProgramData\\*");
            opts.excludeGlobs.push_back("C:\\$Recycle.Bin\\*");
            opts.excludeGlobs.push_back("C:\\System Volume Information\\*");
            opts.excludeGlobs.push_back("C:\\pagefile.sys");
            opts.excludeGlobs.push_back("C:\\hiberfil.sys");
            opts.excludeGlobs.push_back("C:\\swapfile.sys");
#elif defined(__APPLE__)
            // macOS-specific glob exclusions (additional to shouldSkipByProfile)
            opts.excludeGlobs.push_back("*/Pictures/*");
            opts.excludeGlobs.push_back("*/Music/*");
            opts.excludeGlobs.push_back("*/Movies/*");
            opts.excludeGlobs.push_back("*/Desktop/*");
            opts.excludeGlobs.push_back("*/Downloads/*");
            opts.excludeGlobs.push_back("*/Documents/*");
#else
            // Linux-specific glob exclusions
            opts.excludeGlobs.push_back("/media/*");
            opts.excludeGlobs.push_back("/mnt/*");
            opts.excludeGlobs.push_back("/cdrom/*");
#endif

            // Progress callback
            auto onProgress = [&](const std::string& file, uint64_t filesDone, uint64_t filesTotal,
                                 uint64_t bytesDone, uint64_t bytesTotal) {
                auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
                    std::chrono::steady_clock::now() - startTime).count();

                double progress = filesTotal > 0 ? (double)filesDone / filesTotal : 0.0;
                uint64_t estimatedTotal = progress > 0.01 ? (uint64_t)(elapsed / progress) : 0;
                uint64_t remaining = estimatedTotal > elapsed ? estimatedTotal - elapsed : 0;

                std::cout << "PROGRESS:FULL:" << filesDone << ":" << filesTotal
                         << ":" << bytesDone << ":" << bytesTotal
                         << ":" << elapsed << ":" << remaining
                         << ":" << file << std::endl;
            };

            // Detection callback
            int detectionCount = 0;
            auto onDetect = [&](const Detection& det) {
                detectionCount++;
                uniqueFiles.insert(det.filePath);
                std::cout << "DETECTION:"
                         << det.filePath << ","
                         << det.offset << ","
                         << det.algorithm << ","
                         << det.matchString << ","
                         << det.evidenceType << ","
                         << det.severity << std::endl;
            };

            // Cancellation callback
            auto isCancelled = []() -> bool {
                return g_cancelled.load();
            };

            // Scan each root
            for (const auto& root : scanRoots) {
                if (g_cancelled.load()) break;
                if (!fs::exists(root)) continue;

                std::cout << "FULLSCAN:ROOT:" << root << std::endl;
                scanner.scanPathLikeAntivirus(root, opts, onDetect, onProgress, isCancelled);
            }

            std::cout << "FULLSCAN:COMPLETE" << std::endl;

        } else if (fs::is_regular_file(targetPath)) {
            // File scan
            std::cout << "PROGRESS:FILE:" << targetPath << ":0:1" << std::endl;
            results = scanner.scanFileDetailed(targetPath);
            std::cout << "PROGRESS:FILE:" << targetPath << ":1:1" << std::endl;

            for (const auto& det : results) {
                uniqueFiles.insert(det.filePath);
            }
        } else if (fs::is_directory(targetPath)) {
            // Directory scan with progress reporting
            std::cout << "PROGRESS:START:" << targetPath << std::endl;
            results = scanner.scanPathRecursive(targetPath);
            std::cout << "PROGRESS:COMPLETE:" << targetPath << std::endl;

            for (const auto& det : results) {
                uniqueFiles.insert(det.filePath);
            }

            // For directory scans, detections are already output in real-time
            // Skip the detection output loop to avoid duplicates
            goto skip_detection_output;
        } else {
            std::cerr << "Error: Invalid path type: " << targetPath << std::endl;
            return 1;
        }

        // Output results in CSV format (only for non-full scans)
        // Format: filePath,offset,algorithm,matchString,evidenceType,severity
        if (!isFullScan) {
            for (const auto& detection : results) {
                std::cout << "DETECTION:"
                          << detection.filePath << ","
                          << detection.offset << ","
                          << detection.algorithm << ","
                          << detection.matchString << ","
                          << detection.evidenceType << ","
                          << detection.severity << std::endl;
            }
        }

skip_detection_output:

        // Summary
        int totalDetections = isFullScan ? 0 : results.size();
        std::cout << "SUMMARY:TOTAL:" << (isFullScan ? uniqueFiles.size() : totalDetections) << std::endl;

        // Count by severity
        int lowCount = 0, medCount = 0, highCount = 0;
        if (!isFullScan) {
            for (const auto& detection : results) {
                if (detection.severity == "low") lowCount++;
                else if (detection.severity == "med" || detection.severity == "medium") medCount++;
                else if (detection.severity == "high") highCount++;
            }
        }

        std::cout << "SUMMARY:SEVERITY:low:" << lowCount << std::endl;
        std::cout << "SUMMARY:SEVERITY:medium:" << medCount << std::endl;
        std::cout << "SUMMARY:SEVERITY:high:" << highCount << std::endl;
        std::cout << "SUMMARY:FILES:" << uniqueFiles.size() << std::endl;

        if (g_cancelled.load()) {
            std::cout << "SCAN:CANCELLED" << std::endl;
            return 2; // Return code 2 for cancelled
        }

        return 0;

    } catch (const std::exception& e) {
        std::cerr << "Error during scanning: " << e.what() << std::endl;
        return 1;
    }
}