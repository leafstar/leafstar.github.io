---
layout: post
title: "TRPO surrogate explorer"
description: "An interactive comparison of the true return η(π̃) and the TRPO surrogate L_π(π̃) in a two-state MDP."
---

<link rel="stylesheet" href="{{ '/assets/surrogate-explorer/surrogate-explorer.css' | relative_url }}">

<div id="surrogate-explorer"></div>

<script src="{{ '/assets/surrogate-explorer/surrogate-explorer.js' | relative_url }}"></script>
<script>
  SurrogateExplorer.mount(document.getElementById('surrogate-explorer'), {
    mode: 'p',
    anchor: 0.25,
    evaluate: 0.6,
    gamma: 0.9
  });
</script>
