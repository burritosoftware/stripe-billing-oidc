import * as client from 'openid-client';
import Stripe from 'stripe';

interface Env {
	OIDC_ISSUER_URL: string;
	OIDC_CLIENT_ID: string;
	OIDC_CLIENT_SECRET: string;
	OIDC_REDIRECT_URI: string;
	STRIPE_API_KEY: string;
	STRIPE_CUSTOMER_PORTAL_LINK: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Configuration
		const issuerURL = new URL(env.OIDC_ISSUER_URL);
		const clientId = env.OIDC_CLIENT_ID;
		const clientSecret = env.OIDC_CLIENT_SECRET;
		const redirectUri = env.OIDC_REDIRECT_URI;

		const stripe = new Stripe(env.STRIPE_API_KEY);
		const stripePortalURL = env.STRIPE_CUSTOMER_PORTAL_LINK;

		// Callback Handler
		const url = new URL(request.url);
		const pathname = url.pathname;
		const query = url.searchParams;
		const issuer = await client.discovery(issuerURL, clientId, clientSecret);

		if (pathname === '/callback') {
			const state = query.get('state');
			if (!state) return new Response('Missing state', { status: 400 });

			const cookieHeader = request.headers.get('Cookie') || '';
			const sessionMatch = cookieHeader.match(/oidc_session=([^;]+)/);
			if (!sessionMatch) return new Response('Missing or expired session', { status: 400 });

			const [savedState, codeVerifier] = sessionMatch[1].split(':');
			if (state !== savedState) return new Response('Invalid state', { status: 400 });

			const tokens = await client.authorizationCodeGrant(issuer, url, {
				pkceCodeVerifier: codeVerifier,
				expectedState: state,
				idTokenExpected: true,
			});

			const claims = tokens.claims()!;
			const email = claims?.email;

			console.info(`Got OIDC user with email: ${email}`);

			// Stripe Customer Search via OIDC Email Claim

			// Search for customers with the given email and prefetch their subscriptions
			const customers = await stripe.customers.search({
				query: `email:"${email}"`,
				expand: ['data.subscriptions'],
			});

			// Find the most recent customer with an active subscription, or the most recent customer overall
			let mostRecentCustomer = null;
			let mostRecentCustomerWithActiveSub = null;

			for (const customer of customers.data) {
				// Check if this customer has any active subscriptions
				const hasActiveSubscription = customer.subscriptions?.data.some(sub => sub.status === 'active');

				// Update most recent customer with active subscription
				if (hasActiveSubscription && (!mostRecentCustomerWithActiveSub || customer.created > mostRecentCustomerWithActiveSub.created)) {
					mostRecentCustomerWithActiveSub = customer;
				}

				// Update most recent customer overall
				if (!mostRecentCustomer || customer.created > mostRecentCustomer.created) {
					mostRecentCustomer = customer;
				}
			}

			// Prefer the customer with an active subscription, fall back to most recent if none have active subs
			const customer = mostRecentCustomerWithActiveSub || mostRecentCustomer;
			
			if (customer) {
				// Customer matched by email, creating billing portal session and redirecting
				console.info(`Matched ${email} with customer: ${customer.id}`);

				const session = await stripe.billingPortal.sessions.create({
					customer: customer.id,
				});

				console.info(`Portal session created for ${customer.id}: ${session.id}`);

				return Response.redirect(session.url, 302);
			} else {
				// Fallback to just passing the email through to the portal URL if the customer doesn't exist
				console.info(`Couldn't match ${email} with customer, falling back`);
				return Response.redirect(`${stripePortalURL}?prefilled_email=${encodeURIComponent(email?.toString() || '')}`, 302);
			}
		}

		// Login Flow Initiation
		const codeVerifier = client.randomPKCECodeVerifier();
		const state = crypto.randomUUID();

		const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
		const authUrl = client.buildAuthorizationUrl(issuer, {
			redirect_uri: redirectUri,
			scope: 'openid email',
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
			state,
		});

		return new Response(null, {
			status: 302,
			headers: {
				Location: authUrl.href,
				'Set-Cookie': `oidc_session=${state}:${codeVerifier}; HttpOnly; Secure; Max-Age=300; Path=/; SameSite=Lax`
			}
		});
	},
} satisfies ExportedHandler<Env>;
