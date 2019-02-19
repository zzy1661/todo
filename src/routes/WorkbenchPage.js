import React from 'react';
import { connect } from 'dva';
import Workbench from '../components/Workbench';

const WorkbenchPage = ({ dispatch, user}) => {


    return (
        <Workbench>

        </Workbench>
    )
}
  
  // export default Products;
  export default connect(({ user }) => ({
    user,
  }))(WorkbenchPage);