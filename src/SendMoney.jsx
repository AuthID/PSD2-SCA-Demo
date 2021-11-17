import React, { useRef } from 'react';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';

import { useMsal } from '@azure/msal-react';

import { apiUrl, xferAuthority } from './common';

const sendMoney = async (evt, instance, accounts, toRecipient, amountToSend) => {
    evt.preventDefault();

    try {
        const account = accounts.find((v) => !!v.idTokenClaims.email);
        const fromSender = account.localAccountId;
        const senderInfo = account.idTokenClaims.email;
        const res = await fetch(`${apiUrl}api/xferClaim`, {
            method: 'post',
            body: JSON.stringify({
                fromSender, toRecipient, amountToSend, senderInfo,
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!res.ok) {
            throw new Error('Failed to create a claim. Network error.');
        }

        // eslint-disable-next-line camelcase
        const id_token_hint = await res.text();
        instance.acquireTokenRedirect({
            authority: xferAuthority,
            extraQueryParameters: { id_token_hint },
        });
    } catch (e) {
        // eslint-disable-next-line no-alert
        alert(e.message);
    }
};

export default function SendMoney() {
    const { instance, accounts } = useMsal();
    const toRecipientRef = useRef();
    const amountToSendRef = useRef();

    return (
        <Form className="p-4">
            <h2> Send Money </h2>
            <Form.Group className="mb-3" controlId="toRecipient">
                <Form.Label>Email address</Form.Label>
                <Form.Control type="email" placeholder="Enter email" ref={toRecipientRef} />
                <Form.Text className="text-muted">
                    Enter the email address where you want to send your funds.
                </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3" controlId="amountToSend">
                <Form.Label>Amount</Form.Label>
                <Form.Control type="number" placeholder="Enter amount" ref={amountToSendRef} />
                <Form.Text className="text-muted">
                    Enter the amount you want to send.
                </Form.Text>
            </Form.Group>
            <Button
                variant="primary"
                type="submit"
                onClick={(evt) => sendMoney(
                    evt, instance, accounts,
                    toRecipientRef.current.value, `$${amountToSendRef.current.value}`,
                )}
            >
                Send
            </Button>
        </Form>
    );
}
