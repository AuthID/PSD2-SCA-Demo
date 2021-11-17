import { PublicClientApplication } from '@azure/msal-browser';

const clientId = '56a8366b-558a-4850-b1eb-e86451bb188a';
const tenantId = 'authdemob2c.onmicrosoft.com';
// const tenantId = 'ae65fe5f-964f-48bd-85ee-d5eb37e0a82a';

const authority = `https://authdemob2c.b2clogin.com/tfp/${tenantId}/B2C_1A_signup_signin`;
// const authority = `https://login.microsoft.com/${tenantId}`;

export const xferAuthority = `https://authdemob2c.b2clogin.com/tfp/${tenantId}/B2C_1A_confirm_xfer`;

export const apiUrl = 'https://authdemob2c.azurewebsites.net/';

const { hostname, port } = window.location;
export const baseUrl = `https://${hostname}${(port !== 443) ? `:${port}` : ''}`;

export const pca = new PublicClientApplication({
    auth: {
        clientId,
        authority,
        redirectUri: baseUrl,
        postLogoutRedirectUri: baseUrl,
        knownAuthorities: [authority],
    },
});

export const params = {};
(new URL(window.location.href)).searchParams.forEach((v, k) => {
    params[k] = v;
});
