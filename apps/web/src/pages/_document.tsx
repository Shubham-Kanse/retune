import { Head, Html, Main, NextScript } from "next/document";

const DESCRIPTION =
  "Paste a job description. Get a tailored resume, cover letter, and application strategy in under 2 minutes.";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="description" content={DESCRIPTION} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
