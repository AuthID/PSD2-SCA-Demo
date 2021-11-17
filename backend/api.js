const crypto = require('crypto');
const fetch = require('node-fetch');
const $as = require('futoin-asyncsteps');
const jose = require('jose');

const router = require('express').Router();

module.exports = router;

const {
    IDC_BASE_URL,
    IDC_KEY_ID,
    IDC_KEY_VALUE,
    IDC_VERIFY_NAME,
    JWT_ISSUER,
    JWT_AUDIENCE,
    JWT_ALGO,
} = process.env;

if (!IDC_BASE_URL || !IDC_KEY_ID || !IDC_KEY_VALUE || !JWT_AUDIENCE) {
    throw new Error('Missing IDComplete configuration');
}

const IDC_IDENTITY_URL = `${IDC_BASE_URL}/IDCompleteBackendEngine/IdentityService/v1`;
const IDC_ADMIN_URL = `${IDC_BASE_URL}/IDCompleteBackendEngine/Default/AdministrationServiceRest`;
const IDC_AUTH_URL = `${IDC_BASE_URL}/IDCompleteBackendEngine/Default/AuthorizationServiceRest`;

const checkIDCToken = (req) => {
    if (!crypto.timingSafeEqual(Buffer.from(`Bearer ${IDC_KEY_VALUE}`), Buffer.from(req.headers.authorization || ''))) {
        throw new Error('Authorization error');
    }
};

const { hrtime } = process;
const TOKEN_TIMEOUT = 60e9;
let idcAuthToken = null;
let idcRefreshToken = null;
let lastRefresh = null;
const IDCAuthUnsafe = async () => {
    if (!idcAuthToken || !idcRefreshToken || !lastRefresh) {
        // eslint-disable-next-line no-console
        console.log('Getting auth token');

        const idcRes = await fetch(`${IDC_IDENTITY_URL}/auth/token`, {
            method: 'post',
            body: '{}',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${Buffer.from(`${IDC_KEY_ID}:${IDC_KEY_VALUE}`).toString('base64')}`,
            },
        });

        if (idcRes.ok) {
            const rsp = await idcRes.json();
            idcAuthToken = rsp.AccessToken;
            idcRefreshToken = rsp.RefreshToken;
            lastRefresh = hrtime.bigint();
            return;
        }

        throw new Error(`IDC token error: ${await idcRes.text()}`);
    }

    if ((hrtime.bigint() - lastRefresh) > TOKEN_TIMEOUT) {
        // eslint-disable-next-line no-console
        console.log('Refreshing auth token');

        idcAuthToken = null;

        const idcRes = await fetch(`${IDC_BASE_URL}/IDCompleteBackendEngine/IdentityService/v1/auth/refresh`, {
            method: 'post',
            body: JSON.stringify(idcRefreshToken),
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (idcRes.ok) {
            const rsp = await idcRes.json();
            idcAuthToken = rsp.AccessToken;
            idcRefreshToken = rsp.RefreshToken;
            lastRefresh = hrtime.bigint();
            return;
        }

        throw new Error(`IDC refresh error: ${await idcRes.text()}`);
    }
};

const idcAuthMutex = new $as.Mutex();

const IDCAuth = async () => {
    await $as().sync(idcAuthMutex, (asi) => {
        asi.await(IDCAuthUnsafe());
    }).promise();
};

const idcCallThrottle = new $as.Mutex(10, 100);
const asyncAPI = (handler) => (req, res, next) => {
    const wrappedHandler = async () => {
        try {
            await handler(req, res, next);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e.message);
            next(e);
        }
    };
    $as().add(
        (asi) => asi.sync(idcCallThrottle, (asi) => asi.await(wrappedHandler())),
        (_, error) => {
            // eslint-disable-next-line no-console
            console.error(error);
            next(new Error(error));
        },
    ).execute();
};

// Handle registration
//----
router.post('/api/startSelfie', asyncAPI(async (req, res) => {
    checkIDCToken(req);
    await IDCAuth();

    const {
        email,
    } = req.body;

    if (!email.match(/@authid\.ai$/i)) {
        throw new Error('The email is not allowed for the demo!');
    }

    const idcRes = await fetch(`${IDC_ADMIN_URL}/foreignOperations/biometry`, {
        method: 'post',
        body: JSON.stringify({
            CheckLiveness: true,
            TimeoutSec: 3600,
            PhoneNumber: '',
            Email: email || '',
            TransportType: 0,
            IntroductionText: '',
        }),
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idcAuthToken}`,
        },
    });

    if (idcRes.ok) {
        const { OperationId, OneTimeSecret } = await idcRes.json();
        const iframeUrl = `${IDC_BASE_URL}/?i=${OperationId}&s=${OneTimeSecret}`;
        res.json({ OperationId, OneTimeSecret, iframeUrl });
        return;
    }

    throw new Error(`IDC selfie error: ${await idcRes.text()}`);
}));
router.post('/api/checkSelfie', asyncAPI(async (req, res) => {
    checkIDCToken(req);
    await IDCAuth();

    const {
        objectId, email, displayName, OperationId,
    } = req.body;

    if (!objectId || !email || !displayName || !OperationId) {
        throw new Error('Missing parameters');
    }

    const idcRes = await fetch(`${IDC_ADMIN_URL}/foreignOperations/biometry/${OperationId}`, {
        method: 'get',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idcAuthToken}`,
        },
    });

    if (idcRes.ok) {
        const { Status, TempId } = await idcRes.json();

        if (Status !== 1) {
            throw new Error('IDC selfie error: not completed successfully');
        }

        await IDCAuth();
        const accountRes = await fetch(`${IDC_ADMIN_URL}/accounts`, {
            method: 'post',
            body: JSON.stringify({
                AccountNumber: objectId,
                DisplayName: displayName,
                CustomDisplayName: displayName,
                Description: '',
                Custom: true,
                Email: email,
            }),
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idcAuthToken}`,
            },
        });

        if (!accountRes.ok) {
            const accountRsp = await accountRes.json();
            if (accountRsp.ID === 'E_ACCOUNT_ALREADY_EXISTS') {
                // pass
            } else {
                throw new Error(`IDC account error: ${JSON.stringify(accountRsp)}`);
            }
        }

        await IDCAuth();
        const proofRes = await fetch(`${IDC_ADMIN_URL}/accounts/${objectId}/proofedBioCredential`, {
            method: 'post',
            body: JSON.stringify({ TempId }),
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idcAuthToken}`,
            },
        });

        if (!proofRes.ok) {
            const proofRsp = await proofRes.json();
            if (proofRsp.ID === 'E_ACCOUNT_BIOCREDENTIAL_ALREADY_EXISTS') {
                // pass
            } else {
                throw new Error(`IDC account error: ${JSON.stringify(proofRsp)}`);
            }
        }

        res.json({
            status: 'OK',
            authIDEnrolled: true,
        });
        return;
    }

    throw new Error(`IDC selfie error: ${await idcRes.text()}`);
}));

// Handle PSD2
//----
let jwkPublic = null;
let jwkPrivate = null;
let jwtIssuer = null;
let jwtAlgo = null;
let jwtKeyId = null;
let openidConf = null;
let jwks = null;
const idcJwkMutex = new $as.Mutex();
const initJWKUnsafe = async () => {
    if (jwks) {
        return;
    }

    jwtIssuer = JWT_ISSUER || 'https://authdemob2c.azurewebsites.net/';
    jwtAlgo = JWT_ALGO || 'RS256';

    // TODO: load from storage/env
    if (true) {
        const { publicKey, privateKey } = await jose.generateKeyPair(jwtAlgo);
        jwkPublic = publicKey;
        jwkPrivate = privateKey;
    } else {
        jwkPublic = crypto.createPublicKey(
            '-----BEGIN RSA PUBLIC KEY-----\n'
            + 'MIIBCgKCAQEAxGFBc/B4YKtboN1v/UFbXWcoXawCsXJFSlUevdx0p8858l5TYdP3\n'
            + 'T6vLcaYVNwFDyGuN1oXrdUu4tbu5GTLIUUBPOYbhSyhd5wWzKlTcUxHBvj7d35Kc\n'
            + 'fxoejeAJ34Nw9x36v9pEpimgRWN1+Y0G0/rmtY9tNssj2oeg6ipBRAutiEqoAugA\n'
            + 'ig5fgxeqS5D58jFvsbm8XWV+rJ/eEIomVriZYiQRArnFv1cnvghSOvUkzeLJrZvK\n'
            + 'fdQRI5FgihzTGepY/btHreU4lg+JX/lILRFNtqY0GovrXYgj1wO1AZ5ac46bO/WP\n'
            + 'xaTT9jlcN/r6c0cFl330jTBkg29FYC30HwIDAQAB\n'
            + '-----END RSA PUBLIC KEY-----\n',
        );
        jwkPrivate = crypto.createPrivateKey(
            '-----BEGIN RSA PRIVATE KEY-----\n'
            + 'MIIEpQIBAAKCAQEAxGFBc/B4YKtboN1v/UFbXWcoXawCsXJFSlUevdx0p8858l5T\n'
            + 'YdP3T6vLcaYVNwFDyGuN1oXrdUu4tbu5GTLIUUBPOYbhSyhd5wWzKlTcUxHBvj7d\n'
            + '35KcfxoejeAJ34Nw9x36v9pEpimgRWN1+Y0G0/rmtY9tNssj2oeg6ipBRAutiEqo\n'
            + 'AugAig5fgxeqS5D58jFvsbm8XWV+rJ/eEIomVriZYiQRArnFv1cnvghSOvUkzeLJ\n'
            + 'rZvKfdQRI5FgihzTGepY/btHreU4lg+JX/lILRFNtqY0GovrXYgj1wO1AZ5ac46b\n'
            + 'O/WPxaTT9jlcN/r6c0cFl330jTBkg29FYC30HwIDAQABAoIBAQCANo8pRwMQ+k/k\n'
            + 'gy6uxpEENmmgXsGTYOvkUBa2Fs0DEsTefL8ry9xX4+370Vdghi7fF3mPafgEqN97\n'
            + 'p4h97y3h/n67LFjDXSORxaLoLGd8xMcdkqYBZhNO2JrCPlez2nlSnfwsbjEL23mM\n'
            + 'VBeeSnj+xX0DZRUFBTPvZUWmHNhnt6NNUTtoycp9Eg5JC5sBLpseMwMu3t+7LVgX\n'
            + 'cfLvikdBVipxv9qHLTDPsjVve27Ietvaolnu+qZk1+BdBP08cXSH2k2E+S0+waqj\n'
            + 'IgIbBB+GGCG3UF82vYKvZLKvaWDIFDKG7KQSp49O3QEN+VT5Sg9oZxjrzj8swSC3\n'
            + 'Y5pAjwuhAoGBAOQ8LVLuL660zT5q/yc5IC9yavjzDbgq+cjINhLII+iryE0c6wFw\n'
            + 'QtBri3HBd4ZXHxnAqYMOnyCs1ozfsBcMYUITMY/5UxcFtcnzP5Nft8yanSlKBaLv\n'
            + 'FsGg6hiclgjbtSY3xsgwvbHZzcB/tDupzo7R+aQqo4pnMxQCNj27xRhjAoGBANxF\n'
            + 'Bwwf0TaU04x7bQoRQh82oGE+HwSLLYop8oDGFSqrBqCz6xbB7GR2Q3vGI6EZpjOC\n'
            + '+slB76La7rIQxvjteo/AAokHDBxQslThY/j8glK0/VJB300vNe0ivRhXoAALddYj\n'
            + 'bD4q28PYSS8cSEZHxYJHZh5HW1eVS5ApIJwE8XwVAoGBAKsytHC7d4rd1gKW8bNz\n'
            + 'N0A/3BvG/SiDHABOpbjq5XyWtlWZdnIKyiNaOCvpCgX7/bksejpzUkuJOhpLg+OW\n'
            + 'BrIwgYHUbE4dm2HTk4GxT8Yqx+57tsSkAPbXBCHX+vbEDxqOxg3N+cyZaquVXxVN\n'
            + '50HcIRzSWv/rLzY3/oXJ/iqvAoGBAKIET+u2F3/rNjOVsZ1/FkC5QHxmYhBIgwWm\n'
            + 'Vw4rJPSOecCItjm2CDfY2UhYdGqR4DLxe5+/VRFXsczeFEyS+Nx1YigCPAEzxggz\n'
            + 'BQLmUMGfCNmRRDuUpzi2nZojEbgWteT9hyevBJjoJOR3DB5NulRaSh2pZOFmGf9+\n'
            + 'kNLRvAIFAoGAL3Hfh5g/I9V6IZ4QWONcXptpSQrwl4PJ6oUKLIBxot9Col1YC5OZ\n'
            + '2SXb99gYMYjib7K9mQ+vvapfEiCLl1CCR6EobqT3YAMdzc3Ae9lCiFfBl6ytSPVf\n'
            + 'FmzkqcJJL/2h1hZ1Clp54+n9Xr/44DGwuuwmWePNQTIZWO1Uf5z+sjc=\n'
            + '-----END RSA PRIVATE KEY-----\n',
        );
    }

    const key = await jose.exportJWK(jwkPublic);
    jwtKeyId = await jose.calculateJwkThumbprint(key);

    // const exportOpts = { type: 'pkcs1', format: 'pem' };
    // console.log(`Public Key ${jwtKeyId}: ${jwkPublic.export(exportOpts)}`);
    // console.log(`Private Key ${jwtKeyId}: ${jwkPrivate.export(exportOpts)}`);

    openidConf = {
        issuer: jwtIssuer,
        jwks_uri: `${jwtIssuer}.well-known/keys`,
        id_token_signing_alg_values_supported: [jwtAlgo],
        // For compliance:
        authorization_endpoint: `${jwtIssuer}api/authorize`,
        response_types_supported: ['id_token'],
        subject_types_supported: ['public'],
    };

    key.alg = jwtAlgo;
    key.kid = jwtKeyId;
    key.use = 'sig';
    jwks = {
        keys: [key],
    };
};
const initJWK = async () => {
    await $as().sync(
        idcJwkMutex,
        (asi) => asi.await(initJWKUnsafe()),
    ).promise();
};
// eslint-disable-next-line no-console
// initJWK().catch((e) => console.error(e));

router.get('/.well-known/openid-configuration', async (req, res, next) => {
    try {
        await initJWK();
        res.json(openidConf);
    } catch (e) {
        next(e);
    }
});
router.get('/.well-known/keys', async (req, res, next) => {
    try {
        await initJWK();
        res.json(jwks);
    } catch (e) {
        next(e);
    }
});
router.post('/api/xferClaim', async (req, res, next) => {
    try {
        const {
            fromSender,
            toRecipient,
            amountToSend,
            senderInfo,
        } = req.body;

        if (!fromSender || !toRecipient || !amountToSend || !senderInfo) {
            throw new Error('Missing parameters');
        }

        await initJWK();
        const now = new Date();
        res.send(await new jose.SignJWT({
            fromSender,
            toRecipient,
            amountToSend,
            senderInfo,
        })
            .setProtectedHeader({ alg: jwtAlgo, kid: jwtKeyId, typ: 'JWT' })
            .setIssuer(jwtIssuer)
            .setAudience(JWT_AUDIENCE)
            .setIssuedAt(now.getTime() / 1e3)
            .setExpirationTime(now.getTime() / 1e3 + 600)
            .setNotBefore(now.getTime() / 1e3 - 30)
            .sign(jwkPrivate));
    } catch (e) {
        next(e);
    }
});
// NOTE: this is needed only for development purposes
router.options('/api/xferClaim', (req, res) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'POST',
    });
    res.send();
});

router.post('/api/startVerify', asyncAPI(async (req, res) => {
    checkIDCToken(req);
    await IDCAuth();

    const {
        objectId,
        toRecipient,
        amountToSend,
        email,
    } = req.body;

    if (!objectId || !toRecipient || !amountToSend) {
        throw new Error('Missing parameters');
    }

    const idcRes = await fetch(`${IDC_AUTH_URL}/transactions/beginforeign`, {
        method: 'post',
        body: JSON.stringify({
            Name: IDC_VERIFY_NAME || 'Verify_Identity',
            TimeoutSec: 3600,
            PhoneNumber: '',
            Email: email || '',
            TransportType: 0,
            FacialImageAccountNumber: objectId,
            CheckLiveness: true,
            CustomData: [
                {
                    Key: 'recipient',
                    Value: toRecipient,
                },
                {
                    Key: 'amount',
                    Value: amountToSend,
                },
            ],
        }),
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idcAuthToken}`,
        },
    });

    if (idcRes.ok) {
        const { TransactionId, OneTimeSecret } = await idcRes.json();
        const iframeUrl = `${IDC_BASE_URL}/?t=${TransactionId}&s=${OneTimeSecret}`;
        res.json({ TransactionId, OneTimeSecret, iframeUrl });
        return;
    }

    throw new Error(`IDC selfie error: ${await idcRes.text()}`);
}));
router.post('/api/checkVerify', asyncAPI(async (req, res) => {
    checkIDCToken(req);
    await IDCAuth();

    const { TransactionId } = req.body;

    if (!TransactionId) {
        throw new Error('Missing parameters');
    }

    const idcRes = await fetch(`${IDC_AUTH_URL}/transactions/endforeign/${TransactionId}`, {
        method: 'get',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idcAuthToken}`,
        },
    });

    if (idcRes.ok) {
        const { Status } = await idcRes.json();

        if (Status !== 1) {
            throw new Error('IDC selfie error: not completed successfully');
        }

        res.json({ status: 'OK' });
        return;
    }

    throw new Error(`IDC selfie error: ${await idcRes.text()}`);
}));
