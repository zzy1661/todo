const userReducer = (state, action) => {
    switch (action.type) {
        case 'SAVEUSER':
            sessionStorage.setItem('username',action.username);
            sessionStorage.setItem('userToken',action.userToken);
            return { 
                ...state,
                username: action.username,
                userToken: action.userToken
            }
        case 'REMOVEUSER':
            sessionStorage.removeItem('username');
            sessionStorage.removeItem('userToken');
            return { 
                ...state,
                username: '',
                userToken: ''
            }
        default:
            return {
                username:sessionStorage.getItem('username'),
                userToken:sessionStorage.getItem('userToken')
            }
    }
}

export default userReducer