---
layout: page
title: ""
---

<div id="world-stage" class="world-stage">
  <canvas id="world-canvas" class="world-canvas" aria-hidden="true"></canvas>
  <div id="world-sprite-layer" class="world-sprite-layer" aria-hidden="true"></div>

  <div class="world-content">
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="hero-eyebrow">PhD Candidate at Northeastern University</p>
        <h1>Muxing Wang</h1>
        <p class="hero-lead">
          I work on federated reinforcement learning, with a focus on distributed decision-making,
          learning under communication constraints, and the theory that makes collaborative systems reliable.
        </p>
        <p class="hero-support">
          I am advised by <a href="https://lilisu3.sites.northeastern.edu/">Prof. Lili Su</a>.
          Before Northeastern, I studied computer science at the University of Waterloo and statistics
          and operational research at the University of Edinburgh with
          <a href="https://sites.google.com/site/paulindani/">Prof. Daniel Paulin</a>.
        </p>

        <div class="hero-actions">
          <a href="https://leafstar.github.io/MuxingWang.pdf" class="button-primary">Curriculum Vitae</a>
          <a href="https://scholar.google.com/citations?user=wsdIDtsAAAAJ&hl=en" class="button-secondary">Google Scholar</a>
          <a href="{{ '/blog/' | relative_url }}" class="button-secondary">Blog</a>
        </div>
      </div>

      <div class="hero-portrait-panel">
        <div class="hero-portrait-frame">
          <img src="/assets/images/thumbnail_32FFF408@C7739343.328DC562.jpg" alt="Portrait of Muxing Wang" class="hero-portrait" />
        </div>
        <div class="hero-fact-card">
          <p class="hero-fact-label">Current Focus</p>
          <p class="hero-fact-text">Building principled approaches to federated reinforcement learning.</p>
        </div>
      </div>
    </section>

    <section class="home-section story-grid">
      <article class="story-card story-card-accent">
        <p class="story-kicker">Research Direction</p>
        <h2>Learning to cooperate when data and decisions stay distributed.</h2>
        <p>
          My current work studies how agents can learn robust policies in federated settings where
          communication is limited, data is decentralized, and coordination matters.
        </p>
      </article>

      <article class="story-card">
        <p class="story-kicker">Academic Timeline</p>
        <div class="timeline-list">
          <div class="timeline-item">
            <p class="timeline-period">2023 - Present</p>
            <h3>PhD Student</h3>
            <p>Northeastern University, working with Prof. Lili Su on federated reinforcement learning.</p>
          </div>
          <div class="timeline-item">
            <p class="timeline-period">2021 - 2022</p>
            <h3>MSc in Statistics and Operational Research</h3>
            <p>University of Edinburgh, working with Prof. Daniel Paulin.</p>
          </div>
          <div class="timeline-item">
            <p class="timeline-period">2015 - 2020</p>
            <h3>Bachelor's in Computer Science</h3>
            <p>University of Waterloo.</p>
          </div>
        </div>
      </article>
    </section>

    {% include news-and-map.html %}
  </div>
</div>

<script src="{{ '/assets/js/world.js' | relative_url }}" defer></script>
