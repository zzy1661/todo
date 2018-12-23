import { connect } from 'react-redux';
import Login from '../components/Login';

const mapStateToProps = (state) => {
    return {
        username: state.username,
        userToken: state.userToken
    }
}
const mapDispatchToProps = (dispatch) => {
    return {
        onLogin: (username, userToken) => {
            sessionStorage.setItem('username', username);
            sessionStorage.setItem('userToken', userToken);
            dispatch({ type: 'login', username, userToken })
        }
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(Login)