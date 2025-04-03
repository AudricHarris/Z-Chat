# Z-Chat - Application de Chat en Ligne

Z-Chat est une application de chat en ligne qui permet aux utilisateurs de communiquer en temps réel. Cette application a été conteneurisée avec Docker pour faciliter son déploiement.

## Fonctionnalités

- Chat en temps réel avec Socket.IO
- Ajout d'amis et gestion des contacts
- Interface utilisateur moderne et responsive
- Notifications de nouveaux messages
- Personnalisation du profil utilisateur

## Prérequis

- Docker et Docker Compose installés sur votre machine
- Git pour cloner le dépôt

## Installation et démarrage

### Depuis GitHub

1. Clonez le dépôt GitHub :
   ```bash
   git clone https://github.com/votre-username/Z-ChatOnline.git
   cd Z-ChatOnline/Z-Chat
   ```

2. Construisez et démarrez les conteneurs Docker :
   ```bash
   docker-compose up -d --build
   ```

3. Accédez à l'application dans votre navigateur :
   ```
   http://localhost:3000
   ```

### Utilisation de l'image Docker directement

1. Téléchargez l'image Docker :
   ```bash
   docker pull votre-username/z-chat
   ```

2. Démarrez un conteneur :
   ```bash
   docker run -p 3000:3000 votre-username/z-chat
   ```

3. Accédez à l'application dans votre navigateur :
   ```
   http://localhost:3000
   ```

## Développement

Si vous souhaitez développer l'application localement sans Docker :

1. Installez les dépendances :
   ```bash
   npm install
   ```

2. Démarrez le serveur de développement :
   ```bash
   npm start
   ```

## Structure du projet

- `server.js` - Serveur Node.js avec Express et Socket.IO
- `script.js` - Logique côté client pour l'interface utilisateur
- `style.css` - Styles de l'application
- `indexVide.html` - Template HTML de base
- `Dockerfile` - Configuration pour la création de l'image Docker
- `docker-compose.yml` - Configuration pour le déploiement avec Docker Compose

## Déploiement sur un serveur

Pour déployer l'application sur un serveur de production :

1. Clonez le dépôt sur votre serveur
2. Configurez les variables d'environnement si nécessaire
3. Exécutez `docker-compose up -d` pour démarrer l'application
4. Configurez un proxy inverse (comme Nginx) pour gérer les connexions HTTPS

## Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou à soumettre une pull request.

## Licence

Ce projet est sous licence MIT.