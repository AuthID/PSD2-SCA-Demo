import React from 'react';
import { Alert } from 'react-bootstrap';

// eslint-disable-next-line react/prop-types
export default function XferResult({ result, failure }) {
    if (failure || !result) {
        return (
            <Alert variant="danger">
                Transaction has failed!
            </Alert>
        );
    }

    // eslint-disable-next-line react/prop-types
    const { toRecipient, amountToSend } = result.idTokenClaims;

    return (
        <Alert variant="success">
            {`Transaction of ${amountToSend} to ${toRecipient} has been sent!`}
        </Alert>
    );
}
