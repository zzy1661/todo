import { connect } from 'react-redux';
import Login from '../components/Login';

const mapStateToProps = (state) => {
    return {
        router: state.router,
        ...state.basic,       
    }
}
const mapDispatchToProps = (dispatch) => {
    return {
        onLogin: (username, userToken) => {
            dispatch({ type: 'saveUser', username, userToken })
        }
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(Login)