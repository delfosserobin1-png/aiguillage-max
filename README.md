# FloRoBot — quotas et stratégie MAX JEUNE

FloRoBot t'aide à décider **quoi réserver, et quand**, avec ton abonnement MAX JEUNE (ou MAX SENIOR).
Il lit l'open data SNCF, garde l'historique des quotas de tout le réseau, et transforme tout ça en plan d'action.

- **Trajet** : verdict immédiat (réserver maintenant, compromis, attendre ou payer), options à 0 € classées
  (direct, autre horaire, gare voisine, correspondance, 2 billets sur le même train, billet prolongé),
  échéances (J-30, J-7, confirmation J-2 → veille 17 h) exportables dans ton agenda,
  radar des quotas sur 30 jours, carte jour × créneau, et historique relevé par relevé avec probabilités de réouverture.
- **Explorer** : toutes les destinations à 0 € depuis ta gare, avec retour, pour ce week-end ou une date.
- **Mes résas** : compteur des 6 réservations, rappels de confirmation, règle « une réservation par jour et par ville ».
- **Suivi** : état du robot, alertes configurées, générateur d'alerte.

L'app **ne réserve rien à ta place** et ne se connecte jamais à ton compte SNCF :
les conditions de SNCF Connect interdisent les robots de réservation. Il te prévient et te dit quoi faire ; tu cliques.

## Comment ça marche

```
SNCF open data (jeu « tgvmax », publié ~1×/jour vers 4 h 20 UTC)
        │
        ├── GitHub Actions « FloRoBot » (toutes les 30 min le matin, puis toutes les 3 h)
        │     ├─ s'arrête en quelques secondes si rien n'a changé
        │     ├─ met à jour l'historique de chaque trajet (branche `data`)
        │     ├─ envoie les alertes ntfy (config.json)
        │     └─ publie le site sur GitHub Pages
        │
        └── App web (GitHub Pages) : interroge l'API SNCF en direct depuis ton téléphone
              et lit l'historique publié par le robot
```

- `app/` : l'application (HTML/CSS/JS sans dépendance, installable sur l'écran d'accueil).
- `app/shared.js` : le moteur (stratégie, règles MAX, probabilités), partagé avec le robot.
- `collector/collect.mjs` : le robot.
- `config.json` : tes alertes.
- `.github/workflows/robot.yml` : la planification.

## Les alertes

1. Installe l'appli **ntfy** (Android, iOS) et abonne-toi à ton canal secret.
2. Le nom du canal est stocké dans le secret GitHub `NTFY_TOPIC` (Settings → Secrets and variables → Actions).
3. Ajoute tes trajets dans `config.json` (l'onglet Suivi de l'app génère le fichier pour toi) :

```json
{
  "alertes": [
    {
      "nom": "Paris ↔ Lyon, le week-end",
      "de": ["PARIS (intramuros)"],
      "vers": ["LYON (intramuros)"],
      "sens": "aller-retour",
      "jours": ["ven"],
      "heures": ["17:00", "21:00"],
      "jours_retour": ["dim"],
      "heures_retour": ["15:00", "23:59"],
      "arrivee_retour": ["00:00", "23:59"],
      "dates": ["2026-12-01", "2027-01-31"],
      "fermetures": true,
      "note": "Texte libre, affiché dans l'onglet Suivi."
    }
  ]
}
```

Les noms de gares sont ceux du jeu SNCF (`PARIS (intramuros)`, `MARSEILLE ST CHARLES`…) : l'autocomplétion de l'app te les donne.
Tous les champs sauf `de` et `vers` sont facultatifs :

- `heures` : fenêtre de départ ; `arrivee` : fenêtre d'arrivée (une arrivée après minuit compte après 23:59) ;
- au retour, `jours_retour`, `heures_retour` et `arrivee_retour` remplacent `jours`, `heures` et `arrivee` ;
- `fermetures: false` : seulement les ouvertures, pas les fermetures ;
- `note` : un rappel pour toi, affiché dans l'onglet Suivi ;
- `pour` : `"rob"` ou `"flo"`. L'alerte n'apparaît que dans ce compte et part sur son canal ntfy (`NTFY_TOPIC` pour Rob, `NTFY_TOPIC_FLO` pour Flo). Sans `pour`, elle va à Rob.

## Ce que disent (et ne disent pas) les données

- Un départ est **ouvert** ou **fermé** au tarif MAX : pas de nombre de places.
- L'open data est une **photo par jour**. SNCF Connect bouge en temps réel : une place vue ici peut être partie,
  une place libérée dans la journée n'apparaît ici que le lendemain.
- Les probabilités viennent de l'historique collecté par le robot (transitions d'un relevé à l'autre, par trajet,
  jour de semaine, créneau et distance au départ), lissées vers le réseau entier quand un trajet manque de données.
  Elles deviennent fiables après quelques semaines de relevés.

## Développement

```bash
npm test          # tests du moteur
npm run e2e       # données simulées → robot (10 relevés) → app dans Chrome headless, captures dans /tmp/aiguillage-e2e/shots
TGVMAX_FIXTURE=/chemin/vers/snap NTFY_DRYRUN=1 node collector/collect.mjs --state state --config config.json
```

## Sources et crédits

- Données : SNCF Voyageurs, jeu « tgvmax » sur [data.sncf.com](https://ressources.data.sncf.com/explore/dataset/tgvmax/), [licence open data SNCF](https://data.sncf.com/pages/licence).
- Règles MAX JEUNE : [aide SNCF Connect](https://www.sncf-connect.com/aide/max-jeune).
- Merci aux projets communautaires qui ont documenté le jeu de données (TGVMaxWatch, Railax, tgvmax-radar, MaxFinder…).

Projet indépendant, non affilié à la SNCF. Les disponibilités sont indicatives : vérifie toujours sur SNCF Connect.
