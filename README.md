# audit-device-tracker
[![CI](https://github.com/eliedvp/audit-device-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/eliedvp/audit-device-tracker/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/audit-device-tracker.svg)](https://www.npmjs.com/package/audit-device-tracker)
[![license](https://img.shields.io/npm/l/audit-device-tracker.svg)](LICENSE)

Identifiez et auditez les appareils utilisés par vos utilisateurs pour se connecter. Détectez les **identifiants partagés** (par exemple, un collègue utilisant le compte d'une autre personne depuis un autre ordinateur), les **nouveaux appareils**, les **déplacements impossibles** et les **connexions simultanées**, tout en intégrant la protection de la vie privée.

## Pourquoi ?

Un mot de passe partagé paraît parfaitement valide pour un système d'authentification classique. Ce package ajoute une question importante : **quel appareil utilise cet utilisateur et l'a-t-il déjà utilisé auparavant ?**

```text
alice  faible   0   premier_appareil

bob    élevé   60   premier_appareil, appareil_partage_avec_autres_utilisateurs
                     - Appareil également utilisé par : alice

alice  élevé  100   nouvel_appareil, déplacement_impossible, connexion_simultanée
                     - Nouvel appareil : Safari sur iOS
                     - Abidjan -> Paris : 4874 km en 0 min
```

Vous pouvez tester le fonctionnement avec :

```bash
npm run demo
```

## Installation

```bash
npm install audit-device-tracker
```

Nécessite **Node.js 22 ou supérieur**.

Le stockage SQLite nécessite un pilote SQLite : `node:sqlite` intégré à Node.js **22.13+ sans option supplémentaire**, ou `better-sqlite3`.

Ce package ne vous impose aucune dépendance native.

## Utilisation rapide avec Express

```ts
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import {
  DeviceTracker,
  SqliteStorage,
  trackLogin
} from 'audit-device-tracker';

const tracker = new DeviceTracker({
  storage: new SqliteStorage(new DatabaseSync('devices.db')),
  secret: process.env.DEVICE_SECRET!, // au moins 16 caractères
  ipAnonymization: 'partial',

  onNewDevice: (result, userId) =>
    notifyUser(userId, result.device),

  onSuspicious: (result, userId) =>
    alertSecurityTeam(userId, result),

  onError: (error) =>
    console.error(error),
});

const app = express();

app.use(express.json());

app.post('/login', async (req, res) => {
  const user = await authenticate(req.body); // votre propre authentification

  const result = await trackLogin(
    tracker,
    req,
    res,
    user.id
  );

  if (result.riskLevel === 'high') {
    return res.status(403).json({
      mfaRequired: true
    });
  }

  res.json({ ok: true });
});
```

Appelez `trackLogin` **uniquement après une authentification réussie**.

`result.findings` explique le score obtenu en termes simples et peut être utilisé directement dans un journal d'audit.

## Comment un appareil est reconnu

Le package utilise principalement deux mécanismes :

1. **Cookie signé (HMAC-SHA256)** : signal fort qui ne peut pas être falsifié sans votre clé secrète. Un cookie valide est considéré comme fiable.

2. **Fingerprint de secours** : empreinte basée sur le navigateur, le système d'exploitation, le type d'appareil et la langue, avec éventuellement le fingerprint fourni par le navigateur. L'adresse IP et la version du navigateur ne sont pas utilisées. Ce mécanisme est moins fiable et est utilisé uniquement lorsqu'aucun cookie valide n'est disponible.

## Règles et calcul du risque

Chaque règle est un petit objet indépendant. Les points des règles déclenchées sont additionnés jusqu'à un maximum de 100.

| Règle                                                           | Motif                            | Points |
| --------------------------------------------------------------- | -------------------------------- | -----: |
| Appareil déjà utilisé par **un autre utilisateur**              | `device_shared_with_other_users` |    +60 |
| Nouvel appareil alors que l'utilisateur en possédait déjà       | `new_device`                     |    +35 |
| Nouvelle IP sur un appareil connu                               | `new_ip`                         |    +10 |
| Déplacement impossible sur un nouvel appareil                   | `impossible_travel`              |    +60 |
| Déplacement impossible sur un appareil connu                    | `impossible_travel`              |    +40 |
| Connexion simultanée (autre appareil, autre IP, moins de 5 min) | `simultaneous_login`             |    +20 |

### Niveaux de risque

* **Faible** : < 30
* **Moyen** : 30 à 59
* **Élevé** : ≥ 60

Le tout premier appareil d'un utilisateur sert de référence et obtient un score de **0**.

### Ajouter sa propre règle

Vous pouvez ajouter vos propres règles ou remplacer celles fournies par défaut :

```ts
import {
  defaultRules,
  type Rule
} from 'audit-device-tracker';

const nightLogin: Rule = {
  name: 'night-login',

  evaluate: (ctx) =>
    ctx.now.getUTCHours() < 5
      ? {
          reason: 'night_login',
          points: 15,
          detail: 'Connexion effectuée pendant la nuit'
        }
      : null,
};

new DeviceTracker({
  storage,
  secret,
  rules: [
    ...defaultRules(),
    nightLogin
  ]
});
```

## Géolocalisation et déplacements impossibles

Vous pouvez fournir une option `geo` avec une méthode `lookup(ip)`.

Sans fournisseur de géolocalisation, les règles liées à la localisation restent désactivées.

```ts
import maxmind, { type CityResponse } from 'maxmind';
import { MaxMindGeo } from 'audit-device-tracker';

const reader = await maxmind.open<CityResponse>(
  './GeoLite2-City.mmdb'
);

const tracker = new DeviceTracker({
  storage,
  secret,
  geo: new MaxMindGeo(reader)
});
```

La base **GeoLite2** est gratuite, mais nécessite un compte MaxMind pour être téléchargée et n'est pas incluse dans le package.

`StaticGeo` permet d'utiliser une table de localisation fixe pour les tests et les démonstrations.

## Fingerprint côté navigateur (optionnel)

```ts
import {
  fingerprintHeaders
} from 'audit-device-tracker/client';

await fetch('/login', {
  method: 'POST',
  headers: {
    ...(await fingerprintHeaders())
  },
  body
});
```

Le fingerprint utilise uniquement quelques informations à faible pouvoir d'identification :

* résolution de l'écran ;
* fuseau horaire ;
* nombre de cœurs ;
* plateforme ;
* langues.

Le package n'utilise volontairement **ni Canvas, ni WebGL, ni analyse des polices**.

Ces techniques peuvent être utilisées pour suivre les personnes plutôt que pour auditer les appareils.

Le serveur considère le fingerprint comme **un simple indice et non comme une identité**.

## Options

| Option                         | Valeur par défaut | Description                                                                                                  |
| ------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `storage`                      | obligatoire       | Un `StorageAdapter` : `MemoryStorage`, `SqliteStorage` ou votre propre stockage                              |
| `secret`                       | obligatoire       | Sert à signer le cookie de l'appareil (minimum 16 caractères)                                                |
| `cookieName`                   | `adt_did`         | Nom du cookie de l'appareil                                                                                  |
| `cookieSecure`                 | `true`            | Mettre `false` uniquement en développement local avec HTTP                                                   |
| `ipAnonymization`              | `none`            | `partial` masque la dernière partie d'une IPv4 / le suffixe d'une IPv6                                       |
| `geo`                          | -                 | Un `GeoProvider` pour activer les règles de localisation                                                     |
| `rules`                        | règles intégrées  | Remplace les règles ou les combine avec `defaultRules()`                                                     |
| `suspiciousThreshold`          | `60`              | Score à partir duquel `onSuspicious` est déclenché                                                           |
| `onNewDevice` / `onSuspicious` | -                 | Hooks permettant de déclencher des alertes                                                                   |
| `onError`                      | -                 | Appelé lorsqu'un hook, une règle ou le fournisseur Geo génère une erreur ; la connexion n'est jamais bloquée |

Vous pouvez également utiliser :

```ts
tracker.getDevices(userId)
tracker.getLoginHistory(userId)
tracker.revokeDevice(userId, id)
tracker.trustDevice(userId, id)
```

Cela permet notamment de créer une page **« Mes appareils »**.

`trustDevice` permet de déclarer comme légitime un appareil partagé, par exemple un ordinateur d'accueil ou de réception.

## Créer son propre stockage

Vous pouvez implémenter l'interface `StorageAdapter` composée de 8 méthodes.

Utilisez ensuite la suite de tests commune pour vérifier que votre stockage se comporte comme les stockages intégrés :

```text
tests/storage-contract.ts
```

## Limites et précautions

* `MemoryStorage` perd toutes ses données au redémarrage. Utilisez `SqliteStorage` ou votre propre stockage pour conserver les données.
* La détection des appareils partagés dépend de la conservation du cookie. Utilisez HTTPS en production.
* Un navigateur qui refuse ou supprime le cookie réduit l'efficacité de cette détection.
* La géolocalisation par IP reste approximative et un VPN peut modifier la localisation détectée.
* Un déplacement impossible constitue **un signal à examiner et non une preuve de fraude**.
* Les déplacements courts de moins de 300 km sont ignorés.
* Derrière un proxy, configurez Express afin que `req.ip` corresponde à l'adresse réelle du client :

```ts
app.set('trust proxy', 1);
```

Ne faites pas confiance à `X-Forwarded-For` sans configuration appropriée du proxy.

* Un appareil partagé peut être parfaitement légitime, par exemple dans une salle de formation ou une réception. Utilisez `trustDevice` dans ce cas.
* Les données relatives aux appareils peuvent constituer des données personnelles. Vous êtes responsable de la base légale, de la durée de conservation et de l'information des utilisateurs requises par la réglementation applicable.
* Utilisez notamment `ipAnonymization` et `revokeDevice` lorsque cela est approprié.

## Développement

```bash
npm test
npm run build
npm run demo
```

## Licence

MIT — voir le fichier `LICENSE`.
