const { KMSClient, EncryptCommand, DecryptCommand } = require('@aws-sdk/client-kms');

const kmsClient = new KMSClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const KMS_KEY_ID = process.env.KMS_KEY_ID;

/**
 * Encrypts a plaintext string using AWS KMS.
 * Returns base64-encoded ciphertext blob.
 * @param {string} text - The plaintext to encrypt
 * @returns {Promise<string>} Base64-encoded ciphertext
 */
exports.encryptSecret = async (text) => {
    if (!KMS_KEY_ID) {
        throw new Error('KMS_KEY_ID environment variable is not set. Deploy the stack first.');
    }

    const command = new EncryptCommand({
        KeyId: KMS_KEY_ID,
        Plaintext: Buffer.from(text, 'utf8'),
    });

    const result = await kmsClient.send(command);
    return Buffer.from(result.CiphertextBlob).toString('base64');
};

/**
 * Decrypts a base64-encoded ciphertext blob using AWS KMS.
 * Returns the original plaintext string.
 * @param {string} cipherText - Base64-encoded ciphertext
 * @returns {Promise<string>} Decrypted plaintext
 */
exports.decryptSecret = async (cipherText) => {
    const command = new DecryptCommand({
        CiphertextBlob: Buffer.from(cipherText, 'base64'),
    });

    const result = await kmsClient.send(command);
    return Buffer.from(result.Plaintext).toString('utf8');
};
