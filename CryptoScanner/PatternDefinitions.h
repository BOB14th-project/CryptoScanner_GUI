#pragma once

#include <regex>
#include <string>
#include <vector>
#include <cstdint>

struct AlgorithmPattern {
    std::string name;
    std::regex  pattern;
    std::string severity;  // "high", "med", "low"
};

struct BytePattern {
    std::string name;
    std::vector<uint8_t> bytes;
    std::string type;
    std::string severity;  // "high", "med", "low"
};

namespace pattern_loader { struct AstRule; }

namespace crypto_patterns {
    std::vector<AlgorithmPattern> getDefaultPatterns();
    std::vector<BytePattern>      getDefaultOIDBytePatterns();
    std::vector<pattern_loader::AstRule> getDefaultASTRules();
}
