#!/usr/sbin/dtrace -s

#pragma D option quiet
#pragma D option switchrate=10hz
#pragma D option zdefs

dtrace:::BEGIN
{
    printf("[\n");
    start_time = walltimestamp;
}

/* OpenSSL - AES operations (basic detection only, no argument reading) */
pid$target::EVP_EncryptInit_ex:entry,
pid$target::EVP_EncryptInit_ex2:entry,
pid$target::EVP_DecryptInit_ex:entry,
pid$target::EVP_DecryptInit_ex2:entry
{
    printf("{\"event\":\"evp_init\",\"function\":\"%s\",\"timestamp\":%llu},\n",
           probefunc, (unsigned long long)(walltimestamp - start_time));
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

/* OpenSSL - Cipher operations (entry probes only) */
pid$target::EVP_CIPHER_CTX_new:entry
{
    printf("{\"event\":\"cipher_ctx_new\",\"timestamp\":%llu},\n",
           (unsigned long long)(walltimestamp - start_time));
}

pid$target::EVP_CIPHER_CTX_free:entry
{
    printf("{\"event\":\"cipher_ctx_free\",\"timestamp\":%llu},\n",
           (unsigned long long)(walltimestamp - start_time));
}

/* OpenSSL - Key operations (entry probes only) */
pid$target::EVP_PKEY_new:entry
{
    printf("{\"event\":\"pkey_new\",\"timestamp\":%llu},\n",
           (unsigned long long)(walltimestamp - start_time));
}

pid$target::EVP_PKEY_free:entry
{
    printf("{\"event\":\"pkey_free\",\"timestamp\":%llu},\n",
           (unsigned long long)(walltimestamp - start_time));
}

/* OpenSSL - RSA operations (basic detection) */
pid$target::RSA_public_encrypt:entry,
pid$target::RSA_private_decrypt:entry,
pid$target::RSA_private_encrypt:entry,
pid$target::RSA_public_decrypt:entry
{
    printf("{\"event\":\"rsa_operation\",\"function\":\"%s\",\"timestamp\":%llu},\n",
           probefunc, (unsigned long long)(walltimestamp - start_time));
}

/* OpenSSL - ECC operations */
pid$target::ECDSA_sign:entry,
pid$target::ECDSA_verify:entry
{
    printf("{\"event\":\"ecdsa_operation\",\"function\":\"%s\",\"timestamp\":%llu},\n",
           probefunc, (unsigned long long)(walltimestamp - start_time));
}

pid$target::EC_KEY_new:entry
{
    printf("{\"event\":\"ec_key_new\",\"timestamp\":%llu},\n",
           (unsigned long long)(walltimestamp - start_time));
}

/* OpenSSL - Hash/HMAC operations (basic detection) */
pid$target::EVP_DigestInit_ex:entry,
pid$target::EVP_DigestInit_ex2:entry
{
    printf("{\"event\":\"digest_init\",\"function\":\"%s\",\"timestamp\":%llu},\n",
           probefunc, (unsigned long long)(walltimestamp - start_time));
}

pid$target::HMAC_Init_ex:entry
{
    printf("{\"event\":\"hmac_init\",\"timestamp\":%llu},\n",
           (unsigned long long)(walltimestamp - start_time));
}

/* CommonCrypto (Apple's native crypto) - basic detection only */
pid$target::CCCrypt:entry
{
    printf("{\"event\":\"cccrypt\",\"timestamp\":%llu},\n",
           (unsigned long long)(walltimestamp - start_time));
}

pid$target::CCCryptorCreate:entry
{
    printf("{\"event\":\"cccryptor_create\",\"timestamp\":%llu},\n",
           (unsigned long long)(walltimestamp - start_time));
}

pid$target::CCKeyDerivationPBKDF:entry
{
    printf("{\"event\":\"pbkdf\",\"timestamp\":%llu},\n",
           (unsigned long long)(walltimestamp - start_time));
}

pid$target::CCDigest:entry
{
    printf("{\"event\":\"cc_digest\",\"timestamp\":%llu},\n",
           (unsigned long long)(walltimestamp - start_time));
}

pid$target::CCHmac:entry
{
    printf("{\"event\":\"cc_hmac\",\"timestamp\":%llu},\n",
           (unsigned long long)(walltimestamp - start_time));
}

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
