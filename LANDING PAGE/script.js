document.addEventListener("DOMContentLoaded", () => {
  // Mobile Menu Toggle
  const mobileToggle = document.querySelector(".mobile-toggle");
  const closeMenu = document.querySelector(".close-menu");
  const mobileOverlay = document.querySelector(".mobile-menu-overlay");
  const mobileLinks = document.querySelectorAll(".mobile-nav-links a");

  function toggleMenu() {
    mobileOverlay.classList.toggle("active");
    document.body.style.overflow = mobileOverlay.classList.contains("active")
      ? "hidden"
      : "";
  }

  if (mobileToggle) {
    mobileToggle.addEventListener("click", toggleMenu);
  }

  if (closeMenu) {
    closeMenu.addEventListener("click", toggleMenu);
  }

  // Close menu when clicking outside or on a link
  mobileOverlay.addEventListener("click", (e) => {
    if (e.target === mobileOverlay) toggleMenu();
  });

  mobileLinks.forEach((link) => {
    link.addEventListener("click", toggleMenu);
  });

  // Sticky Header Effect
  const header = document.querySelector("header");

  window.addEventListener("scroll", () => {
    if (window.scrollY > 50) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  });

  // Scroll Reveal Animation
  const revealElements = document.querySelectorAll(".scroll-reveal");

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          // Optional: Stop observing once revealed
          // revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15,
      rootMargin: "0px 0px -50px 0px",
    },
  );

  revealElements.forEach((el) => revealObserver.observe(el));

  // Smooth Scroll for Anchor Links (Polite fallback for Safari)
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const targetId = this.getAttribute("href");
      if (targetId === "#") return;

      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        const headerOffset = 80;
        const elementPosition = targetElement.getBoundingClientRect().top;
        const offsetPosition =
          elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
      }
    });
  });
});
