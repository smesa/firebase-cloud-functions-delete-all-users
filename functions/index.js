const functions      = require('firebase-functions');
const admin          = require('firebase-admin');
const rp             = require('request-promise');
const promisePool    = require('es6-promise-pool');
const newPool        = promisePool.PromisePool;
const secureCompare  = require('secure-compare');
const MAX_CONCURRENT = 3;

admin.initializeApp(functions.config().firebase);

exports.deleteAllUsers = functions.https.onRequest((req, res) => {

  // Consulto todos los usuarios registrados
  getUsers().then(users => {

    // Muevo los usuarios a una constante
    const usersListToDelete = users;

    // Usamos Pool para eliminar MAX_CONCURRENT en paralelo
    const promisePool = new newPool(() => {

      if (usersListToDelete.length > 0) {

        const userToDelete = usersListToDelete.pop();

        return admin.auth().deleteUser(userToDelete.localId).then(() => {
          console.log('Se elimino la cuenta', userToDelete.localId);
        }).catch(error => {
          console.error('Error eliminando la cuenta', userToDelete.localId, 'failed:', error);
        });
      }
    }, MAX_CONCURRENT);

    promisePool.start().then(() => {
      console.log('Eliminación de usuarios finalizada');
      res.send('Eliminación finalizada');
    });

  });
});

function getUsers(userIds = [], nextPageToken, accessToken) {

  // Obtengo el token de acceso
  return getAccessToken(accessToken).then(accessToken => {

    // Realizo la consulta de los usuarios
    const options = {
      method: 'POST',
      uri: 'https://www.googleapis.com/identitytoolkit/v3/relyingparty/downloadAccount?fields=users/localId,users/lastLoginAt,nextPageToken&access_token=' + accessToken,
      body: {
        nextPageToken: nextPageToken,
        maxResults: 10000
      },
      json: true
    };

    return rp(options).then(resp => {
      if (!resp.users) {
        return userIds;
      }
      if (resp.nextPageToken) {
        return getUsers(userIds.concat(resp.users), resp.nextPageToken, accessToken);
      }
      return userIds.concat(resp.users);
    });
  });
}

// Obtener token de autorización
function getAccessToken(accessToken) {

  // Si ya tenia un token lo retorno
  if (accessToken) {
    return Promise.resolve(accessToken);
  }

  const options = {
    uri: 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    headers: {'Metadata-Flavor': 'Google'},
    json: true
  };
  return rp(options).then(resp => resp.access_token);
  
}
