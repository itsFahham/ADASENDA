import { SERVICES } from "../lib/services";

interface Item {
    question: string;
    answer: React.ReactNode;
}

const FAUCET = "https://docs.cardano.org/cardano-testnets/tools/faucet";
const CIP30 = "https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030";
const CIP20 = "https://cips.cardano.org/cip/CIP-20";

const ITEMS: Item[] = [
    {
        question: "What actually happens when I send a postcard?",
        answer: (
            <>
                <p>
                    Your message is attached to a real Cardano transaction as metadata under label
                    674, the <a href={CIP20} target="_blank" rel="noreferrer">CIP-20</a> standard for
                    transaction messages. Wallets and explorers know that label, so the text shows up
                    wherever the transaction does.
                </p>
                <p>
                    Once a block picks it up, it stays there. Everything here runs on the preprod
                    testnet, so the ADA is free and worthless. The permanence is not: whatever you
                    send is public forever.
                </p>
            </>
        ),
    },
    {
        question: "Where do I get test ADA?",
        answer: (
            <>
                <p>
                    From the <a href={FAUCET} target="_blank" rel="noreferrer">Cardano testnet
                    faucet</a>. Pick <b>Preprod</b> as the network, paste your address, and the funds
                    arrive within a minute or two.
                </p>
                <p>
                    The faucet allows one request per IP address per day. If it turns you down, you
                    have already pulled from it today, and waiting is the only option.
                </p>
            </>
        ),
    },
    {
        question: "How do I connect my own wallet?",
        answer: (
            <>
                <ol>
                    <li>
                        Install a Cardano wallet <b>browser extension</b>, for example Eternl or
                        Lace. Get it from the wallet's own website rather than by searching the
                        store, there are convincing fakes.
                    </li>
                    <li>Set the wallet's network to <b>Pre-Production Testnet</b>, not Preview.</li>
                    <li>Create or import a wallet and fund it at the faucet.</li>
                    <li>
                        Mark the account as the <b>dApp account</b> in the wallet. Without it the
                        wallet accepts the connection request but never answers it.
                    </li>
                    <li>Reload this page, pick "Browser wallet" and click your wallet.</li>
                </ol>
                <p className="help-note">
                    Only the extension works. The wallet's web app cannot talk to this page.
                </p>
            </>
        ),
    },
    {
        question: "I clicked connect and nothing happens",
        answer: (
            <>
                <p>
                    The wallet puts the request in its own popup and marks its toolbar icon. Click
                    the extension icon and approve it there.
                </p>
                <p>
                    If it still hangs, an older request is probably still open in the wallet. Close
                    it, reload this page and try again. A wallet that is locked, or has no dApp
                    account set, will also stay silent.
                </p>
            </>
        ),
    },
    {
        question: "Why is the browser wallet option greyed out?",
        answer: (
            <p>
                Because the service you picked does not implement the wallet endpoints yet. Each
                language service is built separately, and they do not all support{" "}
                <a href={CIP30} target="_blank" rel="noreferrer">CIP-30</a> at the same time. Switch
                to a service that does, or send with the generated wallet.
            </p>
        ),
    },
    {
        question: "Why can't I send two postcards in a row?",
        answer: (
            <p>
                A transaction locks the funds it spends until a block includes it, which takes
                roughly twenty seconds. Sending again before that would try to spend the same funds
                twice, and the network rejects it. The send button waits for you.
            </p>
        ),
    },
    {
        question: "Why is my message cut off at 64 bytes?",
        answer: (
            <p>
                Cardano caps a single metadata string at 64 bytes. The counter measures bytes, not
                characters: an umlaut costs two, an emoji four. So thirty emoji will not fit, even
                though thirty letters would.
            </p>
        ),
    },
    {
        question: "What does the service picker at the top do?",
        answer: (
            <>
                <p>
                    It chooses which language builds and submits your transaction. All of them talk
                    to the same blockchain through the same native library and follow the same API
                    contract, so the result is identical. Only the implementation differs.
                </p>
                <ul className="help-ports">
                    {SERVICES.map((service) => (
                        <li key={service.key}>
                            <b>{service.label}</b> <code>{service.url}</code>
                        </li>
                    ))}
                </ul>
            </>
        ),
    },
    {
        question: "The page says a service is not answering",
        answer: (
            <p>
                That service is not running. Start it in a terminal, or pick a different one at the
                top. The message names the port it tried.
            </p>
        ),
    },
    {
        question: "My wallet says I am on mainnet",
        answer: (
            <p>
                Switch it to <b>Pre-Production Testnet</b>. Preprod and preview are different
                networks with different blocks and different faucets, and this app only speaks to
                preprod. A preprod address always starts with <code>addr_test1</code>.
            </p>
        ),
    },
];

export function HelpPanel() {
    return (
        <section className="panel help" aria-label="Help">
            <div className="panel-head">
                <h2>Help</h2>
                <span className="panel-note">how this works, and what to do when it does not</span>
            </div>

            <div className="help-list">
                {ITEMS.map((item) => (
                    <details key={item.question} className="help-item">
                        <summary>{item.question}</summary>
                        <div className="help-answer">{item.answer}</div>
                    </details>
                ))}
            </div>
        </section>
    );
}
