<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { Game } from './core/Game'

const gameHost = ref<HTMLElement | null>(null)
const game = new Game()

onMounted(async () => {
  if (!gameHost.value) {
    return
  }

  await game.mount(gameHost.value)
})

onBeforeUnmount(() => {
  game.destroy()
})
</script>

<template>
  <main class="app-shell">
    <div ref="gameHost" class="game-host" />
  </main>
</template>

<style>
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  overflow: hidden;
}

.app-shell {
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 20% 20%, #1f2c44, #080b15 70%);
}

.game-host {
  width: 100%;
  height: 100%;
}

.game-host canvas {
  display: block;
}
</style>
