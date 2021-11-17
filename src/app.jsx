import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

import {
    MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal,
} from '@azure/msal-react';

import './style.scss';

import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Image from 'react-bootstrap/Image';
import Row from 'react-bootstrap/Row';

import { pca, baseUrl, params } from './common';

import SendMoney from './SendMoney';
import XferResult from './XferResult';

import logo from '../img/authid-logo.png';

// --

if (params.logout) {
    pca.logoutRedirect({
        redirectUrl: baseUrl,
    });
}

// --

const Logout = () => {
    const { accounts } = useMsal();

    if (accounts.length === 0) {
        return <></>;
    }

    return (
        <Col className="flex-grow-0">
            <Button
                variant="secondary"
                onClick={() => pca.logoutRedirect({
                    redirectUrl: baseUrl,
                })}
            >
                Sign&nbsp;Out
            </Button>
        </Col>
    );
};

const MoneyXfer = () => {
    const { instance } = useMsal();
    const [toShow, setToShow] = useState(<>Loading...</>);

    useEffect(() => {
        if (!instance) {
            return;
        }

        instance.handleRedirectPromise()
            .then((res) => {
                if (res && res.idTokenClaims.toRecipient) {
                    setToShow(<XferResult result={res} />);
                } else {
                    setToShow(<SendMoney />);
                }
            })
            .catch(() => {
                setToShow(<XferResult failure />);
            });
    }, [instance]);

    return toShow;
};

const App = () => (
    <MsalProvider instance={pca}>
        <Container className="d-flex flex-column vh-100 m-auto align-self-center">
            <Row>
                <Col className="d-flex justify-content-center">
                    <a href="https://authid.ai/" alt="authID website" target="_blank" rel="author">
                        <Image src={logo} />
                    </a>
                </Col>
            </Row>
            <Row className="d-flex p-3">
                <Col className="d-flex justify-content-center flex-grow-1">
                    <h1>authID PSD2 SCA demo app</h1>
                </Col>
                <Logout />
            </Row>
            <Row className="p-3">
                <Col className="d-flex justify-content-center">
                    <UnauthenticatedTemplate>
                        <Button
                            variant="primary"
                            onClick={() => pca.loginRedirect({
                                scopes: [],
                            })}
                        >
                            SignIn / Register
                        </Button>
                    </UnauthenticatedTemplate>
                    <AuthenticatedTemplate>
                        <MoneyXfer />
                    </AuthenticatedTemplate>
                </Col>
            </Row>
        </Container>
    </MsalProvider>
);

ReactDOM.render(<App />, document.getElementById('root'));
