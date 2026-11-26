"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import NextImage from "next/image";
import Link from "next/link";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  createTranslator,
  ImageAdapterProvider,
  NavigationProvider,
  ThemeAdapterProvider,
  TranslationProvider,
  type ImageComponentProps,
  type NavigationAdapter,
} from "@SAURETMathieu/context";
import {
  DeleteModalProvider,
  ModalProvider,
  StackModalProvider,
  Toaster,
} from "@SAURETMathieu/ui";
import { ThemeProvider, useTheme } from "next-themes";

const messages = {
  save: "Enregistrer",
  cancel: "Annuler",
  close: "Fermer",
  delete: "Supprimer",
  confirm: "Confirmer",
};

function AppImage({
  src,
  alt,
  width,
  height,
  fill,
  sizes,
  priority,
  className,
  style,
}: ImageComponentProps) {
  if (fill) {
    return (
      <NextImage
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={className}
        style={style}
      />
    );
  }

  return (
    <NextImage
      src={src}
      alt={alt}
      width={width ?? 64}
      height={height ?? 64}
      sizes={sizes}
      priority={priority}
      className={className}
      style={style}
    />
  );
}

function SearchParamsSource({
  onChange,
}: {
  onChange: (params: ReturnType<typeof useSearchParams>) => void;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    onChange(searchParams);
  }, [onChange, searchParams]);

  return null;
}

function NavigationBridge({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const [searchParams, setSearchParams] = useState(() => new URLSearchParams());

  const value = useMemo<Partial<NavigationAdapter>>(
    () => ({
      Link: Link as NavigationAdapter["Link"],
      redirect: (url: string) => {
        window.location.href = url;
      },
      getPathname: (input) => {
        if (input.pathname) return input.pathname;
        if (typeof input.href === "string") return input.href;
        if (input.href && typeof input.href === "object") {
          return input.href.pathname;
        }
        return pathname;
      },
      usePathname: () => pathname,
      useRouter: () => ({
        push: (href, options) => {
          router.push(String(href), options as never);
        },
        replace: (href, options) => {
          router.replace(String(href), options as never);
        },
        refresh: () => {
          router.refresh();
        },
      }),
      useSearchParams: () => searchParams,
      useParams: () => params,
    }),
    [params, pathname, router, searchParams]
  );

  return (
    <NavigationProvider value={value}>
      <Suspense fallback={null}>
        <SearchParamsSource onChange={setSearchParams} />
      </Suspense>
      {children}
    </NavigationProvider>
  );
}

function TranslationBridge({ children }: { children: ReactNode }) {
  const value = useMemo(
    () => ({
      locale: "fr",
      t: createTranslator(messages),
      getTranslator: () => undefined,
    }),
    []
  );

  return <TranslationProvider value={value}>{children}</TranslationProvider>;
}

function ThemeBridge({ children }: { children: ReactNode }) {
  const nextTheme = useTheme();

  const value = useMemo(
    () => ({
      useTheme: () => ({
        theme: nextTheme.theme,
        setTheme: nextTheme.setTheme,
        resolvedTheme: nextTheme.resolvedTheme,
        systemTheme: nextTheme.systemTheme,
      }),
    }),
    [nextTheme]
  );

  return <ThemeAdapterProvider value={value}>{children}</ThemeAdapterProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <NavigationBridge>
        <TranslationBridge>
          <ThemeBridge>
            <ImageAdapterProvider value={{ Image: AppImage }}>
              <StackModalProvider>
                <ModalProvider>
                  <DeleteModalProvider>
                    {children}
                    <Toaster />
                  </DeleteModalProvider>
                </ModalProvider>
              </StackModalProvider>
            </ImageAdapterProvider>
          </ThemeBridge>
        </TranslationBridge>
      </NavigationBridge>
    </ThemeProvider>
  );
}
