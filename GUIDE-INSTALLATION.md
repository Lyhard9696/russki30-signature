# INSTALLER RUSSKI 30 SIGNATURE COMPLET SUR IPHONE

## 1. Ce ZIP contient la version complète déployable
À la racine : index.html, styles.css, JS des cours, images/icônes, manifest.webmanifest, sw.js, server.py, render.yaml.
Le professeur IA est fourni sous forme de serveur ; il ne s'active que lorsque tu configures une clé OpenAI API.
L'audio humain natif n'est pas fourni ; l'app utilise la synthèse vocale du navigateur ou la voix IA optionnelle.

## 2. Publier sur GitHub
1. Crée un compte sur https://github.com si nécessaire.
2. Crée un dépôt **privé**, par exemple `russki30-signature`. Ne colle jamais de clé API ou de mot de passe dans le dépôt.
3. Décompresse cette archive.
4. Dans ton dépôt, clique **Add file > Upload files**. Fais glisser TOUS les fichiers **contenus dans le dossier extrait**, pas le dossier parent ni le ZIP. Tu dois voir `index.html`, `server.py` et `render.yaml` à la racine du dépôt.
5. Clique **Commit changes**.

## 3. Créer ta clé IA
1. Va sur https://platform.openai.com/api-keys et connecte-toi.
2. Configure le moyen de paiement/crédits API si nécessaire ; l'API est facturée séparément de ChatGPT Plus.
3. Crée une clé secrète. NE la colle pas dans ChatGPT, GitHub ou dans un fichier du site.
4. Configure des limites budgétaires et surveille les dépenses API : les quotas intégrés à l'application limitent les requêtes, sans garantir un plafond financier.

## 4. Déployer le site ET le professeur IA sur Render
1. Va sur https://dashboard.render.com et connecte GitHub.
2. Crée un **New > Blueprint** puis sélectionne le dépôt `russki30-signature`.
3. Render lit `render.yaml` automatiquement et configure un service web Python. Un écran demandera les secrets du Blueprint :
   - `RUSSKI_ACCESS_CODE` : choisis TON mot de passe solide, au moins 12 caractères. C'est le mot de passe que Safari te demandera.
   - `OPENAI_API_KEY` : ta clé secrète OpenAI API.
4. Valide la création/déploiement. Render donnera une URL HTTPS terminant en `.onrender.com`.
5. Sur l'URL : Safari/navigateur demande des identifiants HTTP. Utilisateur : `russki` ; mot de passe : celui défini dans `RUSSKI_ACCESS_CODE`.
6. Va dans Conversations > Professeur IA pour tester le professeur. Dans Progrès & réglages, choisis « Voix IA du serveur » si désiré.

Si tu ne souhaites pas utiliser Blueprint, crée un **Web Service** connecté au même dépôt : Runtime Python ; Build Command `python -m py_compile server.py` ; Start Command `python server.py` ; ajoute `RUSSKI_HOST=0.0.0.0`, `RUSSKI_ACCESS_CODE` et `OPENAI_API_KEY` dans **Environment**. Le serveur écoute automatiquement `$PORT` de Render.

## 5. Ajouter l'app sur l'iPhone
1. Ouvre ton URL `.onrender.com` dans Safari et connecte-toi.
2. Safari → Partager → Sur l'écran d'accueil → **Ouvrir comme app web** (si affiché) → Ajouter.
3. Ouvre la nouvelle icône RUSSKI SIGNATURE. L'authentification peut être redemandée dans le contexte de l'app installée.

## 6. Limites et sécurité
- **Un seul site** est nécessaire : Render sert à la fois les cours et l'API, aucun compte Netlify nécessaire.
- En formule gratuite, Render peut mettre le serveur en veille après 15 minutes d'inactivité ; sa remise en route peut prendre ~1 minute. La disponibilité n'est pas garantie comme un service payant.
- Les progrès restent dans le navigateur de cet iPhone, pas synchronisés entre appareils. Si tu changes d'URL/domaine, exporte/import tes données depuis Progrès & réglages. Sauvegarde régulièrement.
- Les échanges avec le professeur IA passent par le serveur et le fournisseur API ; n'envoie pas de données sensibles.
- L'accès au serveur est protégé par HTTP Basic **sur HTTPS** ; ne partage pas les identifiants.
- Le serveur applique des quotas simples : 50 requêtes IA/heure, 120/jour et 60 générations vocales/jour, **réinitialisés si le serveur redémarre**. Ces quotas ne sont pas une garantie contre la facturation ou les attaques.
- Aucun enregistrement natif de voix russe n'est fourni. La correction orale compare une transcription, pas l'accent réel.
- La relecture intégrale des traductions par un professeur natif n'a pas été effectuée.

## En cas d'erreur
- Si le site Render affiche « origin returned error code » : consulte les logs du service Render, et vérifie que `render.yaml`, `server.py` sont à la racine, que les secrets sont définis et que le service écoute bien `$PORT`.
- Si le site demande un identifiant : utilisateur `russki`, mot de passe défini dans Render.
- Si le professeur affiche « non connecté » : vérifie `OPENAI_API_KEY` et les logs Render ; assure-toi que l'API dispose de crédits.
- Si le ZIP ne se télécharge pas depuis ChatGPT : essaie de l'ouvrir depuis le navigateur de ton ordinateur plutôt que dans l'app mobile.
