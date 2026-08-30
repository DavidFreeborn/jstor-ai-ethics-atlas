import type { Metadata } from 'next';
import { Geist, Geist_Mono, Newsreader } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'JSTOR AI Ethics Atlas',
  description:
    'An interactive research atlas for comparing semantic topics, mixed-membership models, keyword communities and publishing structures in a JSTOR corpus.',
  openGraph: {
    title: 'JSTOR AI Ethics Atlas',
    description: 'Semantic topics, concept networks and publishing structures.',
    type: 'website',
    images: [{ url: '/jstor-atlas-social.webp', width: 1200, height: 630, alt: 'JSTOR AI Ethics Atlas — a scientific map of literature and concepts' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JSTOR AI Ethics Atlas',
    description: 'Semantic topics, concept networks and publishing structures.',
    images: ['/jstor-atlas-social.webp'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
