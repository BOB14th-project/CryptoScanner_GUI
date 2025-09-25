#include "CryptoScanner.h"

#include <iostream>
#include <filesystem>
#include <iomanip>
#include <set>

namespace fs = std::filesystem;

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <path>" << std::endl;
        return 1;
    }

    std::string targetPath = argv[1];
    CryptoScanner scanner;

    // Check if path exists
    if (!fs::exists(targetPath)) {
        std::cerr << "Error: Path does not exist: " << targetPath << std::endl;
        return 1;
    }

    try {
        std::vector<Detection> results;

        if (fs::is_regular_file(targetPath)) {
            // File scan
            std::cout << "PROGRESS:FILE:" << targetPath << ":0:1" << std::endl;
            results = scanner.scanFileDetailed(targetPath);
            std::cout << "PROGRESS:FILE:" << targetPath << ":1:1" << std::endl;
        } else if (fs::is_directory(targetPath)) {
            // Directory scan with progress reporting
            std::cout << "PROGRESS:START:" << targetPath << std::endl;
            results = scanner.scanPathRecursive(targetPath);
            std::cout << "PROGRESS:COMPLETE:" << targetPath << std::endl;
        } else {
            std::cerr << "Error: Invalid path type: " << targetPath << std::endl;
            return 1;
        }

        // Output results in CSV format
        // Format: filePath,offset,algorithm,matchString,evidenceType,severity
        for (const auto& detection : results) {
            std::cout << "DETECTION:"
                      << detection.filePath << ","
                      << detection.offset << ","
                      << detection.algorithm << ","
                      << detection.matchString << ","
                      << detection.evidenceType << ","
                      << detection.severity << std::endl;
        }

        // Summary
        std::cout << "SUMMARY:TOTAL:" << results.size() << std::endl;

        // Count by severity
        int lowCount = 0, medCount = 0, highCount = 0;
        for (const auto& detection : results) {
            if (detection.severity == "low") lowCount++;
            else if (detection.severity == "med" || detection.severity == "medium") medCount++;
            else if (detection.severity == "high") highCount++;
        }

        std::cout << "SUMMARY:SEVERITY:low:" << lowCount << std::endl;
        std::cout << "SUMMARY:SEVERITY:medium:" << medCount << std::endl;
        std::cout << "SUMMARY:SEVERITY:high:" << highCount << std::endl;

        // Count unique files
        std::set<std::string> uniqueFiles;
        for (const auto& detection : results) {
            uniqueFiles.insert(detection.filePath);
        }
        std::cout << "SUMMARY:FILES:" << uniqueFiles.size() << std::endl;

        return 0;

    } catch (const std::exception& e) {
        std::cerr << "Error during scanning: " << e.what() << std::endl;
        return 1;
    }
}