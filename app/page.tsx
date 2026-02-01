"use client";

import { useEffect, useState } from "react";
import "./landing.css";
import Link from "next/link";

export default function Home() {
  const [mobileMenuActive, setMobileMenuActive] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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

  return (
    <>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header / Navbar */}
      <header id="navbar" className={scrolled ? "scrolled" : ""}>
        <div className="container nav-container">
          <a href="#" className="logo">
            <img src="/assets/logolinhafqnvj.png" alt="Fique no Verde Já" />
          </a>
          <nav className="nav-menu">
            <ul>
              <li><a href="#estrategia" onClick={(e) => handleSmoothScroll(e, "#estrategia")}>Estratégia</a></li>
              <li><a href="#atuacao" onClick={(e) => handleSmoothScroll(e, "#atuacao")}>Atuação</a></li>
              <li><a href="#resultados" onClick={(e) => handleSmoothScroll(e, "#resultados")}>Resultados</a></li>
              <li><a href="#faq" onClick={(e) => handleSmoothScroll(e, "#faq")}>FAQ</a></li>
            </ul>
          </nav>
          <div className="nav-actions">
            <a href="#contato" className="btn-billet-custom" onClick={(e) => handleSmoothScroll(e, "#contato")}>
              <i className="fa-solid fa-check-to-slot"></i> Ficar no verde
            </a>
          </div>
          <div className="mobile-toggle" onClick={toggleMenu}>
            <i className="fas fa-bars"></i>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <div className={`mobile-menu-overlay ${mobileMenuActive ? "active" : ""}`}>
        <div className="mobile-menu-content">
          <div className="mobile-menu-header">
            <span className="logo">
              <img src="/assets/logolinhafqnvj.png" alt="Fique no Verde Já" />
            </span>
            <div className="close-menu" onClick={closeMenu}><i className="fas fa-times"></i></div>
          </div>
          <ul className="mobile-nav-links">
            <li><a href="#estrategia" onClick={(e) => handleSmoothScroll(e, "#estrategia")}>Estratégia</a></li>
            <li><a href="#atuacao" onClick={(e) => handleSmoothScroll(e, "#atuacao")}>Atuação</a></li>
            <li><a href="#resultados" onClick={(e) => handleSmoothScroll(e, "#resultados")}>Resultados</a></li>
            <li><a href="#faq" onClick={(e) => handleSmoothScroll(e, "#faq")}>FAQ</a></li>
          </ul>
          <a href="#contato" className="btn btn-primary btn-full" onClick={(e) => handleSmoothScroll(e, "#contato")}>Quero ficar no verde</a>
        </div>
      </div>

      {/* Hero Section */}
      <section id="home" className="hero">
        <div className="hero-bg-glow"></div>
        <div className="container hero-container">
          <div className="hero-content">
            <div className="hero-badge fade-in-up">
              <i className="fas fa-shield-alt"></i> Atuação estratégica • Dentro das regras
            </div>
            <h1 className="fade-in-up delay-1">
              Você é bom em vender. <br />
              <span className="highlight-text">Então foque nisso.</span>
            </h1>
            <p className="hero-subtitle fade-in-up delay-2">
              Estratégia de venda, preço e escala. Deixa reputação, atrasos e reclamações indevidas com quem vive isso todos os dias — <strong>sempre dentro das regras do Mercado Livre.</strong>
            </p>
            <div className="hero-cta-wrapper fade-in-up delay-3">
              <a href="#contato" className="btn btn-primary btn-lg btn-glow" onClick={(e) => handleSmoothScroll(e, "#contato")}>
                Quero ficar no verde <i className="fas fa-arrow-right"></i>
              </a>
              <span className="cta-microcopy">Análise direta • Sem compromisso</span>
            </div>
          </div>
          <div className="hero-visual fade-in-up delay-4">
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
      <section id="estrategia" className="section-filters">
        <div className="container">
          <div className="filters-grid">
            <div className="filters-text scroll-reveal">
              <h2 className="section-title">
                Volte pros filtros que <span className="text-gradient">realmente vendem</span>
              </h2>
              <p className="section-desc">
                Você sabe a importância disso. Quando a reputação sai do verde, seus anúncios perdem os destaques que mais convertem.
              </p>
              <div className="impact-list">
                <div className="impact-item">
                  <div className="icon-box"><i className="fas fa-shipping-fast"></i></div>
                  <div className="impact-content">
                    <h3>Chegará amanhã</h3>
                    <p>Sem o verde, você perde o filtro de agilidade e coleta.</p>
                  </div>
                </div>
                <div className="impact-item">
                  <div className="icon-box"><i className="fas fa-bolt"></i></div>
                  <div className="impact-content">
                    <h3>Chegará hoje</h3>
                    <p>O filtro Flex desaparece e sua conversão cai drasticamente.</p>
                  </div>
                </div>
              </div>
              <div className="highlight-box">
                <p>Reputação no verde é voltar pros filtros certos.</p>
              </div>
              <a href="#contato" className="btn btn-secondary" onClick={(e) => handleSmoothScroll(e, "#contato")}>Quero voltar pros destaques</a>
            </div>
            <div className="filters-visual scroll-reveal delay-2">
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
      <section className="section-connection">
        <div className="container">
          <div className="connection-header scroll-reveal">
            <h2>Seu tempo rende mais quando você <br />foca no que sabe fazer</h2>
            <p>Você já sabe como o Mercado Livre funciona. Seu tempo vale dinheiro.</p>
          </div>
          <div className="focus-grid scroll-reveal delay-2">
            <div className="focus-card">
              <i className="fas fa-bullseye"></i>
              <h3>Vender Mais</h3>
            </div>
            <div className="focus-card">
              <i className="fas fa-pencil-alt"></i>
              <h3>Ajustar Anúncios</h3>
            </div>
            <div className="focus-card">
              <i className="fas fa-chess"></i>
              <h3>Criar Estratégia</h3>
            </div>
            <div className="focus-card">
              <i className="fas fa-expand-arrows-alt"></i>
              <h3>Escalar Operação</h3>
            </div>
          </div>
          <div className="connection-footer scroll-reveal">
            <p>Resolver impacto de reputação não é o melhor uso da sua energia.</p>
            <a href="#contato" className="btn btn-outline" onClick={(e) => handleSmoothScroll(e, "#contato")}>Deixar isso com especialistas</a>
          </div>
        </div>
      </section>

      {/* Intelligent Outsourcing Section */}
      <section id="atuacao" className="section-outsourcing dark-section">
        <div className="container">
          <div className="outsourcing-content">
            <div className="outsourcing-text scroll-reveal">
              <span className="overline">Terceirização Inteligente</span>
              <h2>Delegar reputação também é <span className="text-primary">estratégia de venda</span></h2>
              <p className="lead">Assim como você não terceiriza sua estratégia de vendas pra qualquer um, reputação também não é tentativa e erro.</p>
              <ul className="check-list">
                <li><i className="fas fa-check-circle"></i> Remoção de atrasos indevidos</li>
                <li><i className="fas fa-check-circle"></i> Atuação em reclamações injustas</li>
                <li><i className="fas fa-check-circle"></i> Correção de impactos que travam a conta</li>
                <li><i className="fas fa-check-circle"></i> Estratégia técnica e segura</li>
              </ul>
              <div className="quote-box">
                <h3>"Você vende melhor quando não precisa apagar incêndio."</h3>
              </div>
              <a href="#contato" className="btn btn-primary btn-glow" onClick={(e) => handleSmoothScroll(e, "#contato")}>Quero minha reputação no verde</a>
            </div>
            <div className="outsourcing-visual"></div>
          </div>
        </div>
      </section>

      {/* How We Act Section */}
      <section className="section-method">
        <div className="container method-container-flex">
          <div className="method-header-side scroll-reveal">
            <h2>
              Atuação
              <span className="highlight-wrapper">
                {" "}direta,
                <img src="/assets/destaque-circulo.webp" className="highlight-img circle-img" alt="Destaque" />
              </span>
              <br />
              sem
              <span className="highlight-wrapper">
                {" "}ruído
                <img src="/assets/destaque-plim.webp" className="highlight-img plim-img" alt="Brilho" />
              </span>
            </h2>
            <p>Método validado para recuperar sua performance.</p>
            <div className="method-cta-side">
              <a href="#contato" className="btn btn-secondary" onClick={(e) => handleSmoothScroll(e, "#contato")}>Analisar minha conta agora</a>
            </div>
          </div>
          <div className="steps-flow">
            <div className="step-item scroll-reveal delay-1">
              <div className="step-bg-number">01</div>
              <div className="step-content">
                <h3>Análise</h3>
                <p>Avaliação objetiva do impacto e da causa raiz na sua conta.</p>
              </div>
            </div>
            <div className="step-item scroll-reveal delay-2">
              <div className="step-bg-number">02</div>
              <div className="step-content">
                <h3>Estratégia</h3>
                <p>Definição da melhor abordagem dentro das regras do ML.</p>
              </div>
            </div>
            <div className="step-item scroll-reveal delay-3">
              <div className="step-bg-number">03</div>
              <div className="step-content">
                <h3>Atuação</h3>
                <p>Execução rápida e técnica para contestar o impacto.</p>
              </div>
            </div>
            <div className="step-item scroll-reveal delay-4">
              <div className="step-bg-number">04</div>
              <div className="step-content">
                <h3>Resultado</h3>
                <p>Foco total em reverter a cor da sua reputação.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Investment & Return Section */}
      <section id="resultados" className="section-roi">
        <div className="container">
          <div className="roi-wrapper glass-panel scroll-reveal">
            <div className="roi-content">
              <h2>Baixo investimento. <br />Alto impacto.</h2>
              <p>Reputação sem estar no verde custa venda todos os dias. Corrigir isso é um investimento pequeno perto do retorno de:</p>
              <div className="roi-points">
                <div className="roi-point">
                  <i className="fas fa-money-bill-wave"></i>
                  <span>Recuperar Visibilidade</span>
                </div>
                <div className="roi-point">
                  <i className="fas fa-unlock"></i>
                  <span>Destravar Conversão</span>
                </div>
                <div className="roi-point">
                  <i className="fas fa-sync-alt"></i>
                  <span>Vender com Constância</span>
                </div>
              </div>
            </div>
            <div className="roi-highlight">
              <div className="highlight-circle">
                <span>A conta no verde</span>
                <strong>SE PAGA SOZINHA</strong>
              </div>
            </div>
            <a href="#contato" className="roi-floating-btn" onClick={(e) => handleSmoothScroll(e, "#contato")}>Voltar<br />pro<br />verde</a>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="section-security">
        <div className="container">
          <div className="security-flex">
            <div className="security-icon scroll-reveal">
              <i className="fas fa-user-shield"></i>
            </div>
            <div className="security-text scroll-reveal delay-1">
              <h2>Atuação independente, <br />sempre dentro das regras</h2>
              <p>A <strong>FIQUE NO VERDE JÁ</strong> atua de forma independente, sem vínculo oficial com o Mercado Livre.</p>
              <p>Todas as ações são realizadas exclusivamente dentro das regras, políticas e critérios da própria plataforma.</p>
              <ul className="security-checks">
                <li><i className="fas fa-shield-check"></i> Nada fora do permitido</li>
                <li><i className="fas fa-shield-check"></i> Nada que coloque sua conta em risco</li>
              </ul>
              <a href="#contato" className="btn btn-outline btn-sm" onClick={(e) => handleSmoothScroll(e, "#contato")}>Ficar no verde com segurança</a>
            </div>
          </div>
        </div>
      </section>

      {/* Impact Phrases Carousel/Grid */}
      <section className="section-impact-cards">
        <div className="container">
          <div className="cards-grid">
            <div className="impact-card card-1 scroll-reveal">
              <div className="impact-icon"><i className="fas fa-ban"></i></div>
              <h3>Sem reputação, <br />não vende.</h3>
            </div>
            <div className="impact-card card-2 scroll-reveal delay-1">
              <div className="impact-icon"><i className="fas fa-user-shield"></i></div>
              <h3>Você faz o que dá dinheiro. <br />A gente protege.</h3>
            </div>
            <div className="impact-card card-3 scroll-reveal delay-2">
              <div className="impact-icon"><i className="fas fa-brain"></i></div>
              <h3>Delegar reputação é <br />decisão inteligente.</h3>
            </div>
            <div className="impact-card card-green scroll-reveal delay-3">
              <div className="impact-icon"><i className="fas fa-chart-line"></i></div>
              <h3>Conta no verde <br />vende mais.</h3>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section id="contato" className="section-final-cta">
        <div className="container cta-container">
          <div className="cta-content scroll-reveal">
            <h2>Enquanto você foca em vender mais, <br />a gente cuida da sua reputação.</h2>
            <p>Se o impacto não foi justo, ele não deveria estar ali. Deixa isso com quem conhece e resolve.</p>
            <form className="contact-form glass-form">
              <div className="form-group">
                <input type="text" placeholder="Seu Nome" required />
              </div>
              <div className="form-group">
                <input type="tel" placeholder="Seu WhatsApp" required />
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-glow">Quero ficar no verde agora</button>
              <span className="form-note"><i className="fas fa-lock"></i> Seus dados estão seguros. Sem compromisso.</span>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="main-footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <a href="#" className="logo footer-logo">
                <img src="/assets/logolinhafqnvj.png" alt="Fique no Verde Já" />
              </a>
              <p>Especialistas em reputação no Mercado Livre.</p>
            </div>
            <div className="footer-links">
              <a href="#">WhatsApp</a>
              <a href="#">Termos de Uso</a>
              <a href="#">Política de Privacidade</a>
            </div>
          </div>
          <div className="footer-disclaimer">
            <p><strong>Aviso legal:</strong> Atuação independente, sem vínculo oficial com o Mercado Livre. Todas as ações são realizadas exclusivamente dentro das regras da plataforma.</p>
            <p className="copyright">© 2026 FIQUE NO VERDE JÁ</p>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp */}
      <a href="#" className="whatsapp-float">
        <i className="fab fa-whatsapp"></i>
      </a>
    </>
  );
}
