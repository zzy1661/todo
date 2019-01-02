import { connect } from 'react-redux';
import Login from '../components/Login';
import {push} from 'connected-react-router';
import {redirect} from '../actions/asyncActions'
const mapStateToProps = (state) => {
    return {
        router: state.router,
        ...state.user,       
    }
}
const mapDispatchToProps = (dispatch) => {
    return {
        test: ()=>{
            dispatch(redirect())
        },
        onLogin: (username, userToken) => {
            dispatch({ type: 'saveUser', username, userToken })
        }
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(Login)