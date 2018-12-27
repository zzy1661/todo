export default {
    login(state, action) {
        sessionStorage.setItem('username', action.username);
        sessionStorage.setItem('userToken', action.userToken);
        return { ...state, username: action.username, userToken: action.userToken }
    },
    logout(state,action) {
        sessionStorage.removeItem('username');
        sessionStorage.removeItem('userToken');
        return { ...state, username: '', userToken: '' }
    }
}