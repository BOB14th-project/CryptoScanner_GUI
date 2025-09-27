#ifndef MINIZ_EXPORT_H
#define MINIZ_EXPORT_H

#ifdef MINIZ_STATIC_DEFINE
#  define MINIZ_EXPORT
#  define MINIZ_NO_EXPORT
#else
#  ifndef MINIZ_EXPORT
#    ifdef _MSC_VER
        /* MSVC */
#      ifdef miniz_EXPORTS
#        define MINIZ_EXPORT __declspec(dllexport)
#      else
#        define MINIZ_EXPORT __declspec(dllimport)
#      endif
#    elif defined(__GNUC__)
        /* GCC */
#      define MINIZ_EXPORT __attribute__((visibility("default")))
#    else
        /* Other compilers */
#      define MINIZ_EXPORT
#    endif
#  endif

#  ifndef MINIZ_NO_EXPORT
#    ifdef _MSC_VER
#      define MINIZ_NO_EXPORT
#    elif defined(__GNUC__)
#      define MINIZ_NO_EXPORT __attribute__((visibility("hidden")))
#    else
#      define MINIZ_NO_EXPORT
#    endif
#  endif
#endif

#ifndef MINIZ_DEPRECATED
#  ifdef _MSC_VER
#    define MINIZ_DEPRECATED __declspec(deprecated)
#  elif defined(__GNUC__)
#    define MINIZ_DEPRECATED __attribute__ ((__deprecated__))
#  else
#    define MINIZ_DEPRECATED
#  endif
#endif

#ifndef MINIZ_DEPRECATED_EXPORT
#  define MINIZ_DEPRECATED_EXPORT MINIZ_EXPORT MINIZ_DEPRECATED
#endif

#ifndef MINIZ_DEPRECATED_NO_EXPORT
#  define MINIZ_DEPRECATED_NO_EXPORT MINIZ_NO_EXPORT MINIZ_DEPRECATED
#endif

#if 0 /* DEFINE_NO_DEPRECATED */
#  ifndef MINIZ_NO_DEPRECATED
#    define MINIZ_NO_DEPRECATED
#  endif
#endif

#endif /* MINIZ_EXPORT_H */
