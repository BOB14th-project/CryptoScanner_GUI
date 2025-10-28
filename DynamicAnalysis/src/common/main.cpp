#include "common/pch.h"
#include "common/dynamic_analysis.h"

#include <filesystem>
#include <iostream>

int main(int argc, char* argv[]) {
    try {
        if (argc == 2) {
            std::filesystem::path target(argv[1]);

            // Use error_code to avoid exceptions in filesystem operations
            std::error_code ec;
            std::filesystem::path dir = target.parent_path();

            // If parent_path is empty, just use the filename
            std::string directory = dir.empty() ? std::string("") : dir.string();
            std::string name = target.filename().string();

            return dynamic_analysis(directory, name);
        }

        if (argc == 3) {
            return dynamic_analysis(argv[1], argv[2]);
        }

        std::cerr << "Usage: " << argv[0] << " <binary-path>" << '\n';
        std::cerr << "   or: " << argv[0] << " <directory> <binary-name>" << '\n';
        return 1;
    }
    catch (const std::filesystem::filesystem_error& e) {
        std::cerr << "[main] Filesystem error: " << e.what() << '\n';
        std::cerr << "[main] This may be due to running with elevated privileges.\n";
        std::cerr << "[main] Attempting to continue anyway...\n";

        // Try to continue with just the binary name
        if (argc >= 2) {
            return dynamic_analysis("", argv[1]);
        }
        return 1;
    }
    catch (const std::exception& e) {
        std::cerr << "[main] Unexpected error: " << e.what() << '\n';
        return 1;
    }
}
