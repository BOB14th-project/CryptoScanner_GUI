TARGET = CryptoScannerCLI
CONFIG += console c++17 staticlib
CONFIG -= app_bundle qt

QMAKE_CXXFLAGS += -Wno-unused-function -Wno-unused-parameter -Wno-unused-but-set-variable -Wno-unused-variable -Wno-type-limits
QMAKE_CFLAGS += -Wno-unused-function -Wno-unused-parameter -Wno-unused-but-set-variable -Wno-unused-variable -Wno-type-limits

QT += core
QT -= gui

DEFINES += USE_MINIZ MINIZ_STATIC_DEFINE QT_CORE_LIB USE_OPENSSL

INCLUDEPATH += . \
    third_party/miniz \
    third_party/tree-sitter/lib/include \
    third_party/tree-sitter/lib/src \
    third_party/tree-sitter-java/bindings/c \
    third_party/tree-sitter-python/bindings/c \
    third_party/tree-sitter-cpp/bindings/c \
    C:\Qt\5.15.2\mingw81_64/include \
    C:\Qt\5.15.2\mingw81_64/include/QtCore \
    C:\Qt\Tools\mingw1310_64/opt/include

LIBS += "C:\Qt\5.15.2\mingw81_64/lib/libQt5Core.a" "C:\Qt\Tools\mingw1310_64/opt/lib/libssl.a" "C:\Qt\Tools\mingw1310_64/opt/lib/libcrypto.a" "C:\Qt\Tools\mingw1310_64/x86_64-w64-mingw32/lib/libz.a" -lws2_32 -lmswsock

SOURCES += \
    main_gui_cli.cpp \
    CryptoScanner.cpp \
    FileScanner.cpp \
    PatternLoader.cpp \
    PatternDefinitions.cpp \
    JavaBytecodeScanner.cpp \
    JavaASTScanner.cpp \
    PythonASTScanner.cpp \
    CppASTScanner.cpp \
    DynLinkParser.cpp \
    third_party/miniz/miniz.c \
    third_party/miniz/miniz_zip.c \
    third_party/miniz/miniz_tinfl.c \
    third_party/miniz/miniz_tdef.c \
    third_party/tree-sitter/lib/src/lib.c

HEADERS += \
    CryptoScanner.h \
    FileScanner.h \
    PatternLoader.h \
    PatternDefinitions.h \
    JavaBytecodeScanner.h \
    JavaASTScanner.h \
    PythonASTScanner.h \
    CppASTScanner.h \
    DynLinkParser.h
