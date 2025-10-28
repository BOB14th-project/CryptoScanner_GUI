#!/usr/sbin/dtrace -s

#pragma D option quiet
#pragma D option switchrate=10hz
#pragma D option zdefs

dtrace:::BEGIN
{
    printf("[\n");
    start_time = walltimestamp;
}

/* OpenSSL - AES operations */
pid$target::EVP_EncryptInit_ex:entry,
pid$target::EVP_EncryptInit_ex2:entry,
pid$target::EVP_DecryptInit_ex:entry,
pid$target::EVP_DecryptInit_ex2:entry
{
    this->cipher = copyinstr(arg2);
    printf("{\"event\":\"evp_init\",\"function\":\"%s\",\"cipher\":\"%s\",\"timestamp\":%llu},\n",
           probefunc, this->cipher, (unsigned long long)(walltimestamp - start_time));
}

pid$target::EVP_EncryptUpdate:entry,
pid$target::EVP_DecryptUpdate:entry
{
    printf("{\"event\":\"evp_update\",\"function\":\"%s\",\"timestamp\":%llu},\n",
           probefunc, (unsigned long long)(walltimestamp - start_time));
}

pid$target::EVP_EncryptFinal_ex:entry,
pid$target::EVP_DecryptFinal_ex:entry
{
    printf("{\"event\":\"evp_final\",\"function\":\"%s\",\"timestamp\":%llu},\n",
           probefunc, (unsigned long long)(walltimestamp - start_time));
}

/* OpenSSL - Cipher operations */
pid$target::EVP_CIPHER_CTX_new:return
{
    printf("{\"event\":\"cipher_ctx_new\",\"ctx\":\"%p\",\"timestamp\":%llu},\n",
           arg1, (unsigned long long)(walltimestamp - start_time));
}

pid$target::EVP_CIPHER_CTX_free:entry
{
    printf("{\"event\":\"cipher_ctx_free\",\"ctx\":\"%p\",\"timestamp\":%llu},\n",
           arg0, (unsigned long long)(walltimestamp - start_time));
}

/* OpenSSL - Key operations */
pid$target::EVP_PKEY_new:return
{
    printf("{\"event\":\"pkey_new\",\"key\":\"%p\",\"timestamp\":%llu},\n",
           arg1, (unsigned long long)(walltimestamp - start_time));
}

pid$target::EVP_PKEY_free:entry
{
    printf("{\"event\":\"pkey_free\",\"key\":\"%p\",\"timestamp\":%llu},\n",
           arg0, (unsigned long long)(walltimestamp - start_time));
}

/* OpenSSL - RSA operations */
pid$target::RSA_public_encrypt:entry,
pid$target::RSA_private_decrypt:entry,
pid$target::RSA_private_encrypt:entry,
pid$target::RSA_public_decrypt:entry
{
    printf("{\"event\":\"rsa_operation\",\"function\":\"%s\",\"flen\":%d,\"timestamp\":%llu},\n",
           probefunc, arg0, (unsigned long long)(walltimestamp - start_time));
}

/* OpenSSL - ECC operations */
pid$target::ECDSA_sign:entry,
pid$target::ECDSA_verify:entry
{
    printf("{\"event\":\"ecdsa_operation\",\"function\":\"%s\",\"timestamp\":%llu},\n",
           probefunc, (unsigned long long)(walltimestamp - start_time));
}

pid$target::EC_KEY_new:return
{
    printf("{\"event\":\"ec_key_new\",\"key\":\"%p\",\"timestamp\":%llu},\n",
           arg1, (unsigned long long)(walltimestamp - start_time));
}

/* OpenSSL - Hash/HMAC operations */
pid$target::EVP_DigestInit_ex:entry,
pid$target::EVP_DigestInit_ex2:entry
{
    this->md_name = copyinstr(arg1);
    printf("{\"event\":\"digest_init\",\"function\":\"%s\",\"md\":\"%s\",\"timestamp\":%llu},\n",
           probefunc, this->md_name, (unsigned long long)(walltimestamp - start_time));
}

pid$target::HMAC_Init_ex:entry
{
    printf("{\"event\":\"hmac_init\",\"timestamp\":%llu},\n",
           (unsigned long long)(walltimestamp - start_time));
}

/* CommonCrypto (Apple's native crypto) */
pid$target::CCCrypt:entry
{
    printf("{\"event\":\"cccrypt\",\"op\":%d,\"alg\":%d,\"options\":%d,\"timestamp\":%llu},\n",
           arg0, arg1, arg2, (unsigned long long)(walltimestamp - start_time));
}

pid$target::CCCryptorCreate:entry
{
    printf("{\"event\":\"cccryptor_create\",\"op\":%d,\"alg\":%d,\"options\":%d,\"timestamp\":%llu},\n",
           arg0, arg1, arg2, (unsigned long long)(walltimestamp - start_time));
}

pid$target::CCKeyDerivationPBKDF:entry
{
    printf("{\"event\":\"pbkdf\",\"algorithm\":%d,\"rounds\":%d,\"timestamp\":%llu},\n",
           arg0, arg2, (unsigned long long)(walltimestamp - start_time));
}

pid$target::CCDigest:entry
{
    printf("{\"event\":\"cc_digest\",\"algorithm\":%d,\"timestamp\":%llu},\n",
           arg0, (unsigned long long)(walltimestamp - start_time));
}

pid$target::CCHmac:entry
{
    printf("{\"event\":\"cc_hmac\",\"algorithm\":%d,\"timestamp\":%llu},\n",
           arg0, (unsigned long long)(walltimestamp - start_time));
}

/* Security Framework - these may not exist in all binaries, so we comment them out for now */
/*
pid$target::SecKeyCreateRandomKey:entry
{
    printf("{\"event\":\"sec_key_create\",\"timestamp\":%llu},\n",
           (unsigned long long)(walltimestamp - start_time));
}

pid$target::SecKeyCreateSignature:entry,
pid$target::SecKeyVerifySignature:entry
{
    printf("{\"event\":\"sec_key_signature\",\"function\":\"%s\",\"timestamp\":%llu},\n",
           probefunc, (unsigned long long)(walltimestamp - start_time));
}
*/

/* Process exit */
pid$target:::exit
{
    printf("{\"event\":\"process_exit\",\"timestamp\":%llu}\n]\n",
           (unsigned long long)(walltimestamp - start_time));
    exit(0);
}

dtrace:::END
{
    printf("{\"event\":\"trace_end\",\"timestamp\":%llu}\n]\n",
           (unsigned long long)(walltimestamp - start_time));
}
