const userReducer = (state, action) => {
    switch (action.type) {
        case 'SAVEUSER':
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