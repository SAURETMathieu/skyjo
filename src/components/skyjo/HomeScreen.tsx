"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Globe, LogIn, Settings } from "lucide-react";

import { getPlayerId, getSavedName, saveName } from "@/lib/skyjo/identity";
import { createRemoteRoom } from "@/lib/skyjo/remote";
import { useSkyjoSettings } from "@/lib/skyjo/settings";
import { BotLevelPicker } from "@/components/skyjo/BotLevelPicker";
import { CardFace } from "@/components/skyjo/CardFace";

const LOCAL_KEY = "skyjo-local-room";

export function HomeScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [panel, setPanel] = useState<
    "home" | "bots" | "join" | "rules" | "options"
  >("home");
  const [bots, setBots] = useState(2);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { settings, update } = useSkyjoSettings();

  useEffect(() => {
    setName(getSavedName());
  }, []);

  function remember() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Entre ton prénom.");
      return null;
    }
    saveName(trimmed);
    setError(null);
    return trimmed;
  }

  async function createGame() {
    const trimmed = remember();
    if (!trimmed) return;
    setLoading(true);
    try {
      const view = await createRemoteRoom(getPlayerId(), trimmed);
      router.push(`/partie/${view.code}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Création impossible."
      );
      setLoading(false);
    }
  }

  function startBots() {
    if (!remember()) return;
    sessionStorage.removeItem(LOCAL_KEY);
    router.push(`/jeu?bots=${bots}&level=${settings.botLevel}`);
  }

  function join() {
    if (!remember()) return;
    const next = code
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4);
    if (next.length < 4) {
      setError("Le code fait 4 caractères.");
      return;
    }
    router.push(`/partie/${next}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white">
      <div className="mx-auto mb-4 flex h-28 items-end justify-center">
        <div className="w-16 -rotate-12">
          <CardFace faceUp value={-2} label="Carte -2" />
        </div>
        <div className="-mx-3 w-16">
          <CardFace faceUp value={1} label="Carte 1" />
        </div>
        <div className="w-16 rotate-12">
          <CardFace faceUp value={12} label="Carte 12" />
        </div>
      </div>
      <h1 className="text-center text-5xl font-extrabold tracking-tight">
        Skyjo
      </h1>
      <p className="mt-2 text-center text-white/70">
        Le plus petit score gagne. Jusqu’à 8 joueurs.
      </p>
      <label
        className="mt-6 block text-sm font-bold text-white/70"
        htmlFor="name"
      >
        Ton prénom
      </label>
      <input
        id="name"
        value={name}
        maxLength={18}
        autoComplete="nickname"
        onChange={(event) => setName(event.target.value)}
        className="mt-1 h-12 rounded-2xl bg-white/10 px-4 text-lg font-bold ring-amber-200 outline-none focus:ring-2"
        placeholder="Alex"
      />

      {panel === "home" ? (
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className={primaryButton}
            disabled={loading}
            onClick={() => void createGame()}
          >
            <Globe className="size-5" />
            Jouer en ligne
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setPanel("bots")}
          >
            <Bot className="size-5" />
            Contre des bots
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setPanel("join")}
          >
            <LogIn className="size-5" />
            Rejoindre une partie
          </button>
          <button
            type="button"
            className="mt-2 text-sm font-bold text-white/70"
            onClick={() => setPanel("options")}
          >
            <Settings className="mr-1 inline size-4" />
            Options
          </button>
          <button
            type="button"
            className="text-sm font-bold text-white/70"
            onClick={() => setPanel("rules")}
          >
            Voir les règles
          </button>
        </div>
      ) : null}

      {panel === "bots" ? (
        <div className="mt-6">
          <p className="text-center font-bold">Nombre de bots</p>
          <div className="mt-3 flex items-center justify-center gap-4">
            <button
              type="button"
              className={roundButton}
              onClick={() => setBots((count) => Math.max(1, count - 1))}
              aria-label="Moins de bots"
            >
              <MinusIcon />
            </button>
            <span className="w-10 text-center text-3xl font-extrabold">
              {bots}
            </span>
            <button
              type="button"
              className={roundButton}
              onClick={() => setBots((count) => Math.min(7, count + 1))}
              aria-label="Plus de bots"
            >
              +
            </button>
          </div>
          <div className="mt-5">
            <BotLevelPicker
              value={settings.botLevel}
              onChange={(botLevel) => update({ botLevel })}
            />
          </div>
          <button
            type="button"
            className={`${primaryButton} mt-4`}
            onClick={startBots}
          >
            Commencer
          </button>
          <button
            type="button"
            className="mt-3 w-full text-sm text-white/70"
            onClick={() => setPanel("home")}
          >
            Retour
          </button>
        </div>
      ) : null}

      {panel === "join" ? (
        <div className="mt-6">
          <label className="text-sm font-bold text-white/70" htmlFor="code">
            Code de la partie
          </label>
          <input
            id="code"
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            autoCorrect="off"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            className="mt-1 h-14 w-full rounded-2xl bg-white/10 text-center text-3xl font-extrabold tracking-[0.35em] uppercase ring-amber-200 outline-none focus:ring-2"
          />
          <button
            type="button"
            className={`${primaryButton} mt-4`}
            onClick={join}
          >
            Rejoindre
          </button>
          <button
            type="button"
            className="mt-3 w-full text-sm text-white/70"
            onClick={() => setPanel("home")}
          >
            Retour
          </button>
        </div>
      ) : null}

      {panel === "options" ? (
        <div className="mt-6">
          <p className="text-center text-lg font-extrabold">Options</p>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3">
            <p className="text-sm font-bold">Message « À toi de jouer »</p>
            <button
              type="button"
              role="switch"
              aria-checked={settings.turnCallout}
              aria-label="Message À toi de jouer"
              onClick={() => update({ turnCallout: !settings.turnCallout })}
              className={`relative h-7 w-12 shrink-0 rounded-full ${
                settings.turnCallout ? "bg-amber-300" : "bg-white/20"
              }`}
            >
              <span
                className={`absolute top-0.5 size-6 rounded-full bg-[#1a1405] ${
                  settings.turnCallout ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </div>
          <button
            type="button"
            className={`${secondaryButton} mt-4`}
            onClick={() => setPanel("home")}
          >
            Retour
          </button>
        </div>
      ) : null}

      {panel === "rules" ? (
        <div className="mt-6 space-y-3 text-sm leading-6 text-white/85">
          <p>
            Chacun a 12 cartes, en 4 colonnes de 3, face cachée. On en retourne
            2.
          </p>
          <p>
            La plus forte somme visible commence. Ensuite, celui qui a fini la
            manche précédente.
          </p>
          <p>
            À ton tour, prends la défausse et échange-la, ou pioche. Si tu
            gardes la pioche, tu remplaces une carte. Sinon tu la défausses et
            tu retournes une carte cachée.
          </p>
          <p>
            Trois cartes identiques dans une colonne partent sur la défausse et
            ne comptent plus.
          </p>
          <p>
            Quand tout est visible, les autres jouent un dernier tour. Le score
            se double s’il est positif et pas strictement le plus bas.
          </p>
          <p>
            La partie s’arrête dès qu’un joueur atteint 100. Le plus petit total
            gagne.
          </p>
          <button
            type="button"
            className={`${secondaryButton} mt-2`}
            onClick={() => setPanel("home")}
          >
            Retour
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="mt-4 text-center text-sm text-rose-200">{error}</p>
      ) : null}
    </main>
  );
}

function MinusIcon() {
  return <span className="text-2xl leading-none">−</span>;
}

const primaryButton =
  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-300 text-lg font-extrabold text-[#1a1405] disabled:opacity-50";
const secondaryButton =
  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 text-lg font-extrabold";
const roundButton =
  "flex size-12 items-center justify-center rounded-full bg-white/10 text-2xl font-bold";
