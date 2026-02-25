# Stripe Billing OIDC
![Icons](https://skillicons.dev/icons?i=cloudflare,workers,ts)


[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/burritosoftware/stripe-billing-oidc)

---
This Cloudflare Worker allows you to create customer portal sessions for Stripe Billing through the email passed by an OpenID Connect-compliant identity provider.  
Made for use at [WiiLink](https://github.com/WiiLink24) to handle donator subscriptions for 100+ supporters.

# Deployment
Deploy using the Deploy to Cloudflare button above.
Afterwards, make sure to fill in all the environment variables listed under [wrangler.jsonc](wrangler.jsonc) either in the file or on the Cloudflare dashboard. **Make sure you have a customer portal link enabled and entered, as this is a fallback in case the Worker cannot match the incoming OIDC email to a Stripe customer.**

The two secrets you will need to configure are `OIDC_CLIENT_SECRET` and `STRIPE_API_KEY`. These must be configured on the Cloudflare dashboard. You need a Stripe API Key (preferrably restricted) that has `Core - Customers: Read` and `Billing - Customer portal: Write`.