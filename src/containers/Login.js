import { connect } from 'react-redux';
import Login from '../components/Login';
import { push, replace } from 'react-router-redux'

const mapStateToProps = (state) => {
    return {
        router: state.router,
        ...state.user,       
    }
}
const mapDispatchToProps = (dispatch) => {
    return {
        test: () => {
            console.log('push /general/all')
            dispatch(push('/'));
        },
        onLogin: (username, userToken) => {
            dispatch({ type: 'saveUser', username, userToken })
        }
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(Login)