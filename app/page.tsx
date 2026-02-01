"use client";

import { useEffect, useState } from "react";
import Head from "next/head";
import Script from "next/script";
import "./landing.css";

export default function Home() {
  const [mobileMenuActive, setMobileMenuActive] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [formName, setFormName] = useState("");
  const [formWhatsApp, setFormWhatsApp] = useState("");

  // Phone number formatting function
  const formatPhoneNumber = (value: string): string => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, "");
    
    // Apply Brazilian phone mask: (XX) XXXXX-XXXX
    if (digits.length <= 2) {
      return digits;
    } else if (digits.length <= 7) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    } else if (digits.length <= 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    } else {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setFormWhatsApp(formatted);
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -50px 0px" }
    );

    document.querySelectorAll(".scroll-reveal").forEach((el) => revealObserver.observe(el));

    return () => {
      window.removeEventListener("scroll", handleScroll);
      revealObserver.disconnect();
    };
  }, []);

  const toggleMenu = () => {
    setMobileMenuActive(!mobileMenuActive);
    document.body.style.overflow = !mobileMenuActive ? "hidden" : "";
  };

  const closeMenu = () => {
    setMobileMenuActive(false);
    document.body.style.overflow = "";
  };

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    if (targetId === "#") return;
    const targetElement = document.querySelector(targetId);
    if (targetElement) {
      const headerOffset = 80;
      const elementPosition = targetElement.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({ top: offsetPosition, behavior: "smooth" });
      closeMenu();
    }
  };

  // JSON-LD Structured Data
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Fique no Verde Já",
    "alternateName": "FQNVJ",
    "url": "https://fiquenoverdeja.com.br",
    "logo": "https://fiquenoverdeja.com.br/assets/logolinhafqnvj.png",
    "description": "Especialistas em recuperação e manutenção de reputação no Mercado Livre. Atuação técnica e dentro das regras para manter sua conta no verde.",
    "sameAs": [],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "availableLanguage": "Portuguese"
    }
  };

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "serviceType": "Gestão de Reputação no Mercado Livre",
    "provider": {
      "@type": "Organization",
      "name": "Fique no Verde Já"
    },
    "name": "Recuperação de Reputação Mercado Livre",
    "description": "Serviço especializado em recuperar e manter a reputação verde de vendedores no Mercado Livre. Remoção de atrasos indevidos, contestação de reclamações injustas e correção de impactos negativos.",
    "areaServed": {
      "@type": "Country",
      "name": "Brasil"
    },
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Serviços de Reputação",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Análise de Conta",
            "description": "Avaliação completa do impacto e causa raiz na sua conta do Mercado Livre"
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Remoção de Atrasos Indevidos",
            "description": "Contestação e remoção de atrasos que impactam sua reputação injustamente"
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Contestação de Reclamações",
            "description": "Atuação em reclamações injustas dentro das regras do Mercado Livre"
          }
        }
      ]
    }
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "O que é a reputação verde no Mercado Livre?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "A reputação verde é o indicador máximo de qualidade de um vendedor no Mercado Livre. Ela permite acesso aos filtros 'Chegará amanhã' e 'Chegará hoje', aumentando significativamente a visibilidade e conversão das vendas."
        }
      },
      {
        "@type": "Question",
        "name": "Como vocês recuperam a reputação?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Atuamos de forma técnica e estratégica, sempre dentro das regras do Mercado Livre. Analisamos a causa raiz do problema, definimos a melhor abordagem e executamos a contestação de impactos indevidos."
        }
      },
      {
        "@type": "Question",
        "name": "A atuação é segura para minha conta?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Sim. Todas as ações são realizadas exclusivamente dentro das regras, políticas e critérios da própria plataforma. Nada fora do permitido e nada que coloque sua conta em risco."
        }
      },
      {
        "@type": "Question",
        "name": "Vocês têm vínculo oficial com o Mercado Livre?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Não. A Fique no Verde Já atua de forma independente, sem vínculo oficial com o Mercado Livre. Somos especialistas em reputação que conhecem profundamente as regras e processos da plataforma."
        }
      }
    ]
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://fiquenoverdeja.com.br"
      }
    ]
  };

  return (
    <>
      {/* SEO Meta Tags */}
      <head>
        <title>Fique no Verde Já | Reputação</title>
        <meta name="description" content="Recupere sua reputação verde no Mercado Livre. Especialistas em remoção de atrasos indevidos, contestação de reclamações e recuperação de conta. Atuação técnica e dentro das regras. Volte pros filtros que vendem!" />
        <meta name="keywords" content="reputação mercado livre, reputação verde mercado livre, recuperar reputação mercado livre, melhorar reputação mercado livre, conta verde mercado livre, especialista mercado livre, atraso mercado livre, reclamação mercado livre, termômetro mercado livre, MercadoLivre" />
        <meta name="author" content="Fique no Verde Já" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <meta name="googlebot" content="index, follow" />
        <link rel="canonical" href="https://fiquenoverdeja.com.br" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://fiquenoverdeja.com.br" />
        <meta property="og:title" content="Fique no Verde Já | Reputação" />
        <meta property="og:description" content="Recupere sua reputação verde no Mercado Livre. Atuação técnica e segura para você voltar aos filtros que mais vendem: Chegará Amanhã e Chegará Hoje." />
        <meta property="og:image" content="https://fiquenoverdeja.com.br/assets/og-image.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:site_name" content="Fique no Verde Já" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://fiquenoverdeja.com.br" />
        <meta name="twitter:title" content="Fique no Verde Já | Reputação" />
        <meta name="twitter:description" content="Recupere sua reputação verde no Mercado Livre. Atuação técnica e segura para você voltar aos filtros que mais vendem." />
        <meta name="twitter:image" content="https://fiquenoverdeja.com.br/assets/og-image.jpg" />
        
        {/* Additional SEO */}
        <meta name="theme-color" content="#00cc6a" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="geo.region" content="BR" />
        <meta name="geo.placename" content="Brasil" />
        <meta httpEquiv="content-language" content="pt-BR" />
        
        {/* Fonts & Icons */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>

      {/* JSON-LD Structured Data */}
      <Script id="organization-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(organizationSchema)}
      </Script>
      <Script id="service-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(serviceSchema)}
      </Script>
      <Script id="faq-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(faqSchema)}
      </Script>
      <Script id="breadcrumb-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(breadcrumbSchema)}
      </Script>

      {/* Header / Navbar */}
      <header id="navbar" className={scrolled ? "scrolled" : ""} role="banner">
        <div className="container nav-container">
          <a href="/" className="logo" aria-label="Fique no Verde Já - Página Inicial">
            <img src="/assets/logolinhafqnvj.png" alt="Fique no Verde Já - Logo" width="180" height="40" />
          </a>
          <nav className="nav-menu" role="navigation" aria-label="Menu principal">
            <ul>
              <li><a href="#estrategia" onClick={(e) => handleSmoothScroll(e, "#estrategia")}>Estratégia</a></li>
              <li><a href="#atuacao" onClick={(e) => handleSmoothScroll(e, "#atuacao")}>Atuação</a></li>
              <li><a href="#resultados" onClick={(e) => handleSmoothScroll(e, "#resultados")}>Resultados</a></li>
            </ul>
          </nav>
          <div className="nav-actions">
            <a href="#contato" className="btn-billet-custom" onClick={(e) => handleSmoothScroll(e, "#contato")}>
              <i className="fa-solid fa-check-to-slot" aria-hidden="true"></i> Ficar no verde
            </a>
            <a href="/login" className="btn-login-custom">
              <i className="fa-solid fa-right-to-bracket" aria-hidden="true"></i> Login
            </a>
          </div>
          <button className="mobile-toggle" onClick={toggleMenu} aria-label="Abrir menu" aria-expanded={mobileMenuActive}>
            <i className="fas fa-bars" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <div className={`mobile-menu-overlay ${mobileMenuActive ? "active" : ""}`} role="dialog" aria-modal="true" aria-label="Menu de navegação">
        <div className="mobile-menu-content">
          <div className="mobile-menu-header">
            <span className="logo">
              <img src="/assets/logolinhafqnvj.png" alt="Fique no Verde Já" width="150" height="35" />
            </span>
            <button className="close-menu" onClick={closeMenu} aria-label="Fechar menu"><i className="fas fa-times" aria-hidden="true"></i></button>
          </div>
          <ul className="mobile-nav-links">
            <li><a href="#estrategia" onClick={(e) => handleSmoothScroll(e, "#estrategia")}>Estratégia</a></li>
            <li><a href="#atuacao" onClick={(e) => handleSmoothScroll(e, "#atuacao")}>Atuação</a></li>
            <li><a href="#resultados" onClick={(e) => handleSmoothScroll(e, "#resultados")}>Resultados</a></li>
            <li><a href="/login"><i className="fa-solid fa-right-to-bracket"></i> Login</a></li>
          </ul>
          <a href="#contato" className="btn btn-primary btn-full" onClick={(e) => handleSmoothScroll(e, "#contato")}>Quero ficar no verde</a>
        </div>
      </div>

      {/* Main Content */}
      <main id="main-content" role="main">
        {/* Hero Section */}
        <section id="home" className="hero" aria-labelledby="hero-title">
          <div className="hero-bg-glow" aria-hidden="true"></div>
          <div className="container hero-container">
            <div className="hero-content">
              <div className="hero-badge fade-in-up">
                <i className="fas fa-shield-alt" aria-hidden="true"></i> Atuação estratégica • Dentro das regras
              </div>
              <h1 id="hero-title" className="fade-in-up delay-1">
                Remoção de impacto para manter sua <span className="highlight-text">reputação no verde.</span>
              </h1>
              <p className="hero-subtitle fade-in-up delay-2">
                Atuamos diretamente na remoção de impactos que afetam a reputação da sua conta, reduzindo riscos e evitando penalizações desnecessárias.<br/><br/>
                Um serviço objetivo, técnico e focado em resultado — <strong>sempre dentro das regras do Mercado Livre.</strong>
              </p>
              <div className="hero-cta-wrapper fade-in-up delay-3">
                <a href="#contato" className="btn btn-primary btn-lg btn-glow" onClick={(e) => handleSmoothScroll(e, "#contato")}>
                  Quero ficar no verde <i className="fas fa-arrow-right" aria-hidden="true"></i>
                </a>
                <span className="cta-microcopy">Análise direta • Sem compromisso</span>
              </div>
            </div>
            <div className="hero-visual fade-in-up delay-4" aria-hidden="true">
              <div className="reputation-card glass-card">
                <div className="rep-header">
                  <span className="rep-title">Reputação Atual</span>
                  <i className="fas fa-ellipsis-h"></i>
                </div>
                <div className="rep-meter">
                  <div className="meter-bar">
                    <div className="meter-fill green-fill"></div>
                  </div>
                  <div className="meter-indicators">
                    <span className="indicator red"></span>
                    <span className="indicator orange"></span>
                    <span className="indicator yellow"></span>
                    <span className="indicator light-green"></span>
                    <span className="indicator green active"><i className="fas fa-check"></i></span>
                  </div>
                </div>
                <div className="rep-stats">
                  <div className="stat">
                    <span className="value">98%</span>
                    <span className="label">Entregas no prazo</span>
                  </div>
                  <div className="stat">
                    <span className="value">0%</span>
                    <span className="label">Reclamações</span>
                  </div>
                </div>
                <div className="floating-badge badge-sales">
                  <i className="fas fa-chart-line"></i> Vendas: +25%
                </div>
                <div className="floating-badge badge-exposure">
                  <i className="fas fa-eye"></i> Visibilidade: Máxima
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Filters & Highlights Section */}
        <section id="estrategia" className="section-filters" aria-labelledby="estrategia-title">
          <div className="container">
            <div className="filters-grid">
              <div className="filters-text scroll-reveal">
                <h2 id="estrategia-title" className="section-title">
                  Volte pros filtros que <span className="text-gradient">realmente vendem</span>
                </h2>
                <p className="section-desc">
                  Você sabe a importância disso. Quando a reputação sai do verde, seus anúncios perdem os destaques que mais convertem.
                </p>
                <div className="impact-list">
                  <article className="impact-item">
                    <div className="icon-box"><i className="fas fa-shipping-fast" aria-hidden="true"></i></div>
                    <div className="impact-content">
                      <h3>Chegará amanhã</h3>
                      <p>Sem o verde, você perde o filtro de agilidade e coleta.</p>
                    </div>
                  </article>
                  <article className="impact-item">
                    <div className="icon-box"><i className="fas fa-bolt" aria-hidden="true"></i></div>
                    <div className="impact-content">
                      <h3>Chegará hoje</h3>
                      <p>O filtro Flex desaparece e sua conversão cai drasticamente.</p>
                    </div>
                  </article>
                </div>
                <div className="highlight-box">
                  <p>Reputação no verde é voltar pros filtros certos.</p>
                </div>
                <a href="#contato" className="btn btn-secondary" onClick={(e) => handleSmoothScroll(e, "#contato")}>Quero voltar pros destaques</a>
              </div>
              <div className="filters-visual scroll-reveal delay-2" aria-hidden="true">
                <div className="visual-card dark-card">
                  <div className="filter-mockup">
                    <div className="mockup-header">Filtros de Busca</div>
                    <div className="mockup-row active">
                      <div className="checkbox checked"></div>
                      <div className="filter-label">Chegará amanhã <span className="tag">Full</span></div>
                    </div>
                    <div className="mockup-row active">
                      <div className="checkbox checked"></div>
                      <div className="filter-label">Chegará hoje <span className="tag">Flex</span></div>
                    </div>
                    <div className="mockup-row">
                      <div className="checkbox"></div>
                      <div className="filter-label">Frete grátis</div>
                    </div>
                    <div className="status-overlay">
                      <div className="status-message">
                        <i className="fas fa-lock"></i>
                        <span>Bloqueado por Reputação</span>
                      </div>
                    </div>
                  </div>
                  <div className="arrow-transform">
                    <i className="fas fa-arrow-down"></i>
                  </div>
                  <div className="filter-mockup success-state">
                    <div className="status-success">
                      <i className="fas fa-check-circle"></i>
                      <span>Elegível e Ativo</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Connection / Seller Section */}
        <section className="section-connection" aria-labelledby="connection-title">
          <div className="container">
            <div className="connection-header scroll-reveal">
              <h2 id="connection-title">Seu tempo rende mais quando você <br />foca no que sabe fazer</h2>
              <p>Você já sabe como o Mercado Livre funciona. Seu tempo vale dinheiro.</p>
            </div>
            <div className="focus-grid scroll-reveal delay-2">
              <article className="focus-card">
                <i className="fas fa-bullseye" aria-hidden="true"></i>
                <h3>Vender Mais</h3>
              </article>
              <article className="focus-card">
                <i className="fas fa-pencil-alt" aria-hidden="true"></i>
                <h3>Ajustar Anúncios</h3>
              </article>
              <article className="focus-card">
                <i className="fas fa-chess" aria-hidden="true"></i>
                <h3>Criar Estratégia</h3>
              </article>
              <article className="focus-card">
                <i className="fas fa-expand-arrows-alt" aria-hidden="true"></i>
                <h3>Escalar Operação</h3>
              </article>
            </div>
            <div className="connection-footer scroll-reveal">
              <p>Resolver impacto de reputação não é o melhor uso da sua energia.</p>
              <a href="#contato" className="btn btn-outline" onClick={(e) => handleSmoothScroll(e, "#contato")}>Deixar isso com especialistas</a>
            </div>
          </div>
        </section>

        {/* Intelligent Outsourcing Section */}
        <section id="atuacao" className="section-outsourcing dark-section" aria-labelledby="outsourcing-title">
          <div className="container">
            <div className="outsourcing-content">
              <div className="outsourcing-text scroll-reveal">
                <span className="overline">Terceirização Inteligente</span>
                <h2 id="outsourcing-title">Delegar reputação também é <span className="text-primary">estratégia de venda</span></h2>
                <p className="lead">Assim como você não terceiriza sua estratégia de vendas pra qualquer um, reputação também não é tentativa e erro.</p>
                <ul className="check-list">
                  <li><i className="fas fa-check-circle" aria-hidden="true"></i> Remoção de atrasos indevidos</li>
                  <li><i className="fas fa-check-circle" aria-hidden="true"></i> Atuação em reclamações injustas</li>
                  <li><i className="fas fa-check-circle" aria-hidden="true"></i> Correção de impactos que travam a conta</li>
                  <li><i className="fas fa-check-circle" aria-hidden="true"></i> Estratégia técnica e segura</li>
                </ul>
                <blockquote className="quote-box">
                  <h3>"Você vende melhor quando não precisa apagar incêndio."</h3>
                </blockquote>
                <a href="#contato" className="btn btn-primary btn-glow" onClick={(e) => handleSmoothScroll(e, "#contato")}>Quero minha reputação no verde</a>
              </div>
              <div className="outsourcing-visual" aria-hidden="true"></div>
            </div>
          </div>
        </section>

        {/* How We Act Section */}
        <section className="section-method" aria-labelledby="method-title">
          <div className="container method-container-flex">
            <div className="method-header-side scroll-reveal">
              <h2 id="method-title">
                Atuação
                <span className="highlight-wrapper">
                  {" "}direta,
                  <img src="/assets/destaque-circulo.webp" className="highlight-img circle-img" alt="" width="150" height="60" />
                </span>
                <br />
                sem
                <span className="highlight-wrapper">
                  {" "}ruído
                  <img src="/assets/destaque-plim.webp" className="highlight-img plim-img" alt="" width="45" height="45" />
                </span>
              </h2>
              <p>Método validado para recuperar sua performance.</p>
              <div className="method-cta-side">
                <a href="#contato" className="btn btn-secondary" onClick={(e) => handleSmoothScroll(e, "#contato")}>Analisar minha conta agora</a>
              </div>
            </div>
            <div className="steps-flow" role="list">
              <article className="step-item scroll-reveal delay-1" role="listitem">
                <div className="step-bg-number" aria-hidden="true">01</div>
                <div className="step-content">
                  <h3>Análise</h3>
                  <p>Avaliação objetiva do impacto e da causa raiz na sua conta.</p>
                </div>
              </article>
              <article className="step-item scroll-reveal delay-2" role="listitem">
                <div className="step-bg-number" aria-hidden="true">02</div>
                <div className="step-content">
                  <h3>Estratégia</h3>
                  <p>Definição da melhor abordagem dentro das regras do ML.</p>
                </div>
              </article>
              <article className="step-item scroll-reveal delay-3" role="listitem">
                <div className="step-bg-number" aria-hidden="true">03</div>
                <div className="step-content">
                  <h3>Atuação</h3>
                  <p>Execução rápida e técnica para contestar o impacto.</p>
                </div>
              </article>
              <article className="step-item scroll-reveal delay-4" role="listitem">
                <div className="step-bg-number" aria-hidden="true">04</div>
                <div className="step-content">
                  <h3>Resultado</h3>
                  <p>Foco total em reverter a cor da sua reputação.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Investment & Return Section */}
        <section id="resultados" className="section-roi" aria-labelledby="roi-title">
          <div className="container">
            <div className="roi-wrapper glass-panel scroll-reveal">
              <div className="roi-content">
                <h2 id="roi-title">Baixo investimento. <br />Alto impacto.</h2>
                <p>Reputação sem estar no verde custa venda todos os dias. Corrigir isso é um investimento pequeno perto do retorno de:</p>
                <div className="roi-points">
                  <div className="roi-point">
                    <i className="fas fa-money-bill-wave" aria-hidden="true"></i>
                    <span>Recuperar Visibilidade</span>
                  </div>
                  <div className="roi-point">
                    <i className="fas fa-unlock" aria-hidden="true"></i>
                    <span>Destravar Conversão</span>
                  </div>
                  <div className="roi-point">
                    <i className="fas fa-sync-alt" aria-hidden="true"></i>
                    <span>Vender com Constância</span>
                  </div>
                </div>
              </div>
              <div className="roi-highlight" aria-hidden="true">
                <div className="highlight-circle">
                  <span>A conta no verde</span>
                  <strong>SE PAGA SOZINHA</strong>
                </div>
              </div>
              <a href="#contato" className="roi-floating-btn" onClick={(e) => handleSmoothScroll(e, "#contato")} aria-label="Voltar pro verde - Entrar em contato">Voltar<br />pro<br />verde</a>
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section className="section-security" aria-labelledby="security-title">
          <div className="container">
            <div className="security-flex">
              <div className="security-icon scroll-reveal" aria-hidden="true">
                <i className="fas fa-user-shield"></i>
              </div>
              <div className="security-text scroll-reveal delay-1">
                <h2 id="security-title">Atuação independente, <br />sempre dentro das regras</h2>
                <p>A <strong>FIQUE NO VERDE JÁ</strong> atua de forma independente, sem vínculo oficial com o Mercado Livre.</p>
                <p>Todas as ações são realizadas exclusivamente dentro das regras, políticas e critérios da própria plataforma.</p>
                <ul className="security-checks">
                  <li><i className="fas fa-shield-check" aria-hidden="true"></i> Nada fora do permitido</li>
                  <li><i className="fas fa-shield-check" aria-hidden="true"></i> Nada que coloque sua conta em risco</li>
                </ul>
                <a href="#contato" className="btn btn-outline btn-sm" onClick={(e) => handleSmoothScroll(e, "#contato")}>Ficar no verde com segurança</a>
              </div>
            </div>
          </div>
        </section>

        {/* Impact Phrases Carousel/Grid */}
        <section className="section-impact-cards" aria-label="Frases de impacto">
          <div className="container">
            <div className="cards-grid">
              <article className="impact-card card-1 scroll-reveal">
                <div className="impact-icon" aria-hidden="true"><i className="fas fa-ban"></i></div>
                <h3>Sem reputação, <br />não vende.</h3>
              </article>
              <article className="impact-card card-2 scroll-reveal delay-1">
                <div className="impact-icon" aria-hidden="true"><i className="fas fa-user-shield"></i></div>
                <h3>Você faz o que dá dinheiro. <br />A gente protege.</h3>
              </article>
              <article className="impact-card card-3 scroll-reveal delay-2">
                <div className="impact-icon" aria-hidden="true"><i className="fas fa-brain"></i></div>
                <h3>Delegar reputação é <br />decisão inteligente.</h3>
              </article>
              <article className="impact-card card-green scroll-reveal delay-3">
                <div className="impact-icon" aria-hidden="true"><i className="fas fa-chart-line"></i></div>
                <h3>Conta no verde <br />vende mais.</h3>
              </article>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="section-faq" aria-labelledby="faq-title">
          <div className="container">
            <h2 id="faq-title" className="section-title scroll-reveal">Perguntas Frequentes</h2>
            <div className="faq-grid scroll-reveal delay-1">
              <details className="faq-item">
                <summary><strong>O que é a reputação verde no Mercado Livre?</strong></summary>
                <p>A reputação verde é o indicador máximo de qualidade de um vendedor no Mercado Livre. Ela permite acesso aos filtros "Chegará amanhã" e "Chegará hoje", aumentando significativamente a visibilidade e conversão das vendas.</p>
              </details>
              <details className="faq-item">
                <summary><strong>Como vocês recuperam a reputação?</strong></summary>
                <p>Atuamos de forma técnica e estratégica, sempre dentro das regras do Mercado Livre. Analisamos a causa raiz do problema, definimos a melhor abordagem e executamos a contestação de impactos indevidos.</p>
              </details>
              <details className="faq-item">
                <summary><strong>A atuação é segura para minha conta?</strong></summary>
                <p>Sim. Todas as ações são realizadas exclusivamente dentro das regras, políticas e critérios da própria plataforma. Nada fora do permitido e nada que coloque sua conta em risco.</p>
              </details>
              <details className="faq-item">
                <summary><strong>Vocês têm vínculo oficial com o Mercado Livre?</strong></summary>
                <p>Não. A Fique no Verde Já atua de forma independente, sem vínculo oficial com o Mercado Livre. Somos especialistas em reputação que conhecem profundamente as regras e processos da plataforma.</p>
              </details>
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section id="contato" className="section-final-cta" aria-labelledby="cta-title">
          <div className="container cta-container">
            <div className="cta-content scroll-reveal">
              <h2 id="cta-title">Enquanto você foca em vender mais, <br />a gente cuida da sua reputação.</h2>
              <p>Se o impacto não foi justo, ele não deveria estar ali. Deixa isso com quem conhece e resolve.</p>
              <form className="contact-form glass-form" action="#" method="POST" aria-label="Formulário de contato">
                <div className="form-group">
                  <label htmlFor="name" className="sr-only">Seu Nome</label>
                  <input 
                    type="text" 
                    id="name" 
                    name="name" 
                    placeholder="Seu Nome" 
                    required 
                    autoComplete="name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="whatsapp" className="sr-only">Seu WhatsApp</label>
                  <input 
                    type="tel" 
                    id="whatsapp" 
                    name="whatsapp" 
                    placeholder="(11) 98935-2639" 
                    required 
                    autoComplete="tel"
                    value={formWhatsApp}
                    onChange={handlePhoneChange}
                    maxLength={16}
                    inputMode="numeric"
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-block btn-glow">Quero ficar no verde agora</button>
                <span className="form-note"><i className="fas fa-lock" aria-hidden="true"></i> Seus dados estão seguros. Sem compromisso.</span>
              </form>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="main-footer" role="contentinfo">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <a href="/" className="logo footer-logo" aria-label="Fique no Verde Já - Página inicial">
                <img src="/assets/logolinhafqnvj.png" alt="Fique no Verde Já" width="180" height="40" />
              </a>
              <p>Especialistas em reputação no Mercado Livre.</p>
            </div>
            <nav className="footer-links" aria-label="Links do rodapé">
              <a href="#">WhatsApp</a>
              <a href="#">Termos de Uso</a>
              <a href="#">Política de Privacidade</a>
            </nav>
          </div>
          <div className="footer-disclaimer">
            <p className="company-info" style={{ marginBottom: '15px', opacity: 0.7, fontSize: '0.85rem' }}>
              CNPJ: 46.391.045/0001-35<br />
              R MAXIMILIANO DEMARCHI, 477 - DEMARCHI, SÃO BERNARDO DO CAMPO - SP, 09820-400
            </p>
            <p><strong>Aviso legal:</strong> Atuação independente, sem vínculo oficial com o Mercado Livre. Todas as ações são realizadas exclusivamente dentro das regras da plataforma.</p>
            <p className="copyright">© 2026 FIQUE NO VERDE JÁ - Todos os direitos reservados</p>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp */}
      <a href="https://api.whatsapp.com/send/?phone=5511989352639&text&type=phone_number&app_absent=0" className="whatsapp-float" target="_blank" rel="noopener noreferrer" aria-label="Entrar em contato pelo WhatsApp">
        <i className="fab fa-whatsapp" aria-hidden="true"></i>
      </a>

      {/* Screen Reader Only Styles */}
      <style>{`
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
    </>
  );
}
