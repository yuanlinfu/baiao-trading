const header = document.querySelector('.site-header');
const navToggle = document.querySelector('.nav-toggle');
const yearTargets = document.querySelectorAll('[data-year]');
const revealTargets = document.querySelectorAll('.hero, .section, .site-footer');

if (navToggle && header) {
  navToggle.addEventListener('click', () => {
    const isOpen = header.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

yearTargets.forEach((target) => {
  target.textContent = new Date().getFullYear();
});

revealTargets.forEach((target) => {
  target.setAttribute('data-reveal', '');
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 }
);

revealTargets.forEach((target) => revealObserver.observe(target));