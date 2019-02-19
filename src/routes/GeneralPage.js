import React from 'react';
import { connect } from 'dva';
import General from '../components/General';

const GeneralPage = ({ dispatch, user}) => {


    return (
        <General>

        </General>
    )
}
  
  // export default Products;
  export default connect(({ user }) => ({
    user,
  }))(GeneralPage);